class MicAnalyzerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(4096);
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
  // Include low E on a four-string bass. Remove DC offset before comparing lags.
  let mean = 0;
  for (const value of frame) mean += value;
  mean /= frame.length;
  const centered = Float32Array.from(frame, (value) => value - mean);
  let energy = 0;
  for (const value of centered) energy += value * value;
  if (Math.sqrt(energy / frame.length) < 0.008) return null;
  const minLag = Math.floor(sampleRateValue / 1600);
  const maxLag = Math.min(
    Math.floor(sampleRateValue / 35),
    Math.floor(frame.length / 2),
  );
  const correlations = new Float32Array(maxLag + 1);
  let strongest = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0,
      energyA = 0,
      energyB = 0;
    for (let i = 0; i < centered.length - lag; i++) {
      const a = centered[i],
        b = centered[i + lag];
      correlation += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    correlations[lag] = correlation / Math.sqrt(energyA * energyB || 1);
    strongest = Math.max(strongest, correlations[lag]);
  }
  // Choose the earliest strong local peak, avoiding octave-down estimates from
  // choosing a later repeated period with a slightly higher correlation.
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const peak = correlations[lag];
    if (
      peak < 0.8 ||
      peak < strongest * 0.95 ||
      peak < correlations[lag - 1] ||
      peak < correlations[lag + 1]
    )
      continue;
    const before = correlations[lag - 1],
      after = correlations[lag + 1];
    const denominator = before - 2 * peak + after;
    const adjustment = denominator ? (0.5 * (before - after)) / denominator : 0;
    return sampleRateValue / (lag + adjustment);
  }
  return null;
}

registerProcessor("mic-analyzer", MicAnalyzerProcessor);
