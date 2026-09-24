export type AnalysisFrame = {
  type: "analysis-frame";
  rms: number;
  onset: boolean;
  pitchHz: number | null;
  atAudioTime: number;
};

export type MicAnalyzerState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "running"; rms: number; pitchHz: number | null }
  | { status: "denied"; message: string }
  | { status: "unsupported"; message: string };

export class MicAnalyzer {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async start(onFrame: (frame: AnalysisFrame) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      throw new Error("Mic analysis requires getUserMedia and AudioWorklet support.");
    }

    this.context = new AudioContext({ latencyHint: "interactive" });
    await this.context.audioWorklet.addModule("/worklets/mic-analyzer.js");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, "mic-analyzer");
    this.node.port.onmessage = (event: MessageEvent<AnalysisFrame>) => {
      if (event.data.type === "analysis-frame") onFrame(event.data);
    };

    const silentGain = this.context.createGain();
    silentGain.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(silentGain).connect(this.context.destination);
  }

  stop(): void {
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.context = null;
    this.stream = null;
    this.node = null;
    this.source = null;
  }
}
