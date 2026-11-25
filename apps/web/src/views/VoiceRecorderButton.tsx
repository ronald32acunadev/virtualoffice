import { useEffect, useRef, useState } from "react";
import {
  buildVoiceRecordingFilename,
  formatDurationSeconds,
  pickRecorderAudioMime,
} from "../state/attachments";

type VoiceRecorderButtonProps = {
  disabled?: boolean;
  onAudioRecorded: (file: File) => void;
  onTranscript?: (text: string) => void;
  onError: (message: string) => void;
};

export function VoiceRecorderButton({
  disabled,
  onAudioRecorded,
  onTranscript,
  onError,
}: VoiceRecorderButtonProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const transcriptRef = useRef<string>("");
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  };

  const startRecording = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError("Audio recording is not supported in this browser.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Unable to access the microphone.");
      return;
    }

    const mimeType = pickRecorderAudioMime(
      typeof MediaRecorder.isTypeSupported === "function"
        ? (m) => MediaRecorder.isTypeSupported(m)
        : undefined,
    );
    mimeTypeRef.current = mimeType;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      onError("Unable to start audio recording.");
      return;
    }

    chunksRef.current = [];
    transcriptRef.current = "";
    setSeconds(0);

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    streamRef.current = stream;

    timerRef.current = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    try {
      const w = window as unknown as Record<string, unknown>;
      const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (typeof SpeechRecognitionCtor === "function") {
        const recognition = new (SpeechRecognitionCtor as new () => {
          lang: string;
          continuous: boolean;
          interimResults: boolean;
          onresult: (event: {
            resultIndex: number;
            results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
          }) => void;
          onerror: () => void;
          onend: () => void;
          start: () => void;
          stop: () => void;
        })();
        recognition.lang = navigator.language || "en-US";
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
          try {
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const result = event.results[i];
              if (result && result.isFinal) {
                const text = result[0]?.transcript ?? "";
                if (text) {
                  transcriptRef.current = transcriptRef.current
                    ? `${transcriptRef.current} ${text}`
                    : text;
                }
              }
            }
          } catch {
            // ignore
          }
        };
        recognition.onerror = () => {};
        recognition.onend = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch {
      // Optional browser speech recognition; audio attachment still works without it.
    }

    setRecording(true);
  };

  const finishRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      stopTimer();
      stopTracks();
      stopRecognition();
      setRecording(false);
      return;
    }

    const mimeType = mimeTypeRef.current;
    const chunks = chunksRef.current;

    recorder.onstop = () => {
      stopTimer();
      stopTracks();
      stopRecognition();

      const blob = new Blob(chunks, { type: mimeType });
      const file = new File([blob], buildVoiceRecordingFilename(mimeType), {
        type: mimeType,
      });
      onAudioRecorded(file);

      const transcript = transcriptRef.current.trim();
      if (transcript) {
        onTranscript?.(transcript);
      }

      chunksRef.current = [];
      transcriptRef.current = "";
      mediaRecorderRef.current = null;
      setRecording(false);
      setSeconds(0);
    };

    try {
      recorder.stop();
    } catch {
      stopTimer();
      stopTracks();
      stopRecognition();
      mediaRecorderRef.current = null;
      setRecording(false);
    }
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    chunksRef.current = [];
    transcriptRef.current = "";
    mediaRecorderRef.current = null;
    stopTimer();
    stopTracks();
    stopRecognition();
    setRecording(false);
    setSeconds(0);
  };

  useEffect(() => {
    return () => {
      stopTimer();
      stopTracks();
      stopRecognition();
      mediaRecorderRef.current = null;
    };
  }, []);

  if (recording) {
    return (
      <div className="composer-voice-wrap">
        <button
          type="button"
          className="composer-voice-btn is-recording"
          title="Stop recording and attach audio"
          aria-label="Stop recording"
          onClick={finishRecording}
        >
          ⏹ {formatDurationSeconds(seconds)}
        </button>
        <button
          type="button"
          className="composer-voice-btn"
          title="Cancel recording"
          aria-label="Cancel recording"
          onClick={cancelRecording}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="composer-voice-btn"
      title="Record voice message"
      aria-label="Record voice message"
      disabled={disabled}
      onClick={() => void startRecording()}
    >
      🎤
    </button>
  );
}
