class MicAnalyzerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(2048);
    this.writeIndex = 0;
    this.lastRms = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      this.frame[this.writeIndex] = channel[i];
      this.writeIndex += 1;

      if (this.writeIndex >= this.frame.length) {
        const analysis = analyzeFrame(this.frame, sampleRate, this.lastRms);
        this.lastRms = analysis.rms;
        this.port.postMessage(analysis);
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

function analyzeFrame(frame, sampleRateValue, previousRms) {
  let sumSquares = 0;
  for (let i = 0; i < frame.length; i += 1) {
    sumSquares += frame[i] * frame[i];
  }

  const rms = Math.sqrt(sumSquares / frame.length);
  const onset = rms > 0.025 && rms > previousRms * 1.7;
  const pitchHz = estimatePitch(frame, sampleRateValue);

  return {
    type: "analysis-frame",
    rms,
    onset,
    pitchHz,
    atAudioTime: currentTime,
  };
}

function estimatePitch(frame, sampleRateValue) {
  const threshold = 0.12;
  const minLag = Math.floor(sampleRateValue / 1200);
  const maxLag = Math.floor(sampleRateValue / 65);
  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;

    for (let i = 0; i < frame.length - lag; i += 1) {
      const a = frame[i];
      const b = frame[i + lag];
      correlation += a * b;
      energyA += a * a;
      energyB += b * b;
    }

    const normalized = correlation / Math.sqrt(energyA * energyB || 1);
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < threshold) return null;
  return sampleRateValue / bestLag;
}

registerProcessor("mic-analyzer", MicAnalyzerProcessor);
