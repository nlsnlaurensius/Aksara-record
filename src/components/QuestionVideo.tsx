import { useRef, useState } from 'react';
import type { Question } from '../types';

interface QuestionVideoProps {
  question: Question;
  index: number;
  total: number;
  disabled?: boolean;
  onPlaybackChange?: (playing: boolean) => void;
}

export function QuestionVideo({
  question,
  index,
  total,
  disabled = false,
  onPlaybackChange,
}: QuestionVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const videoUrl = `${import.meta.env.BASE_URL}${question.video_asset.replace(/^assets\//, '')}`;

  const replay = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    await video.play();
  };

  return (
    <section className="question-card" aria-labelledby="question-heading">
      <div className="question-card__header">
        <div>
          <span className="eyebrow">Pertanyaan {index + 1} dari {total}</span>
          <h2 id="question-heading">Dengarkan pertanyaan</h2>
        </div>
        <span className="question-id">{question.id}</span>
      </div>
      <div className="question-video-frame">
        {failed ? (
          <div className="video-fallback">
            <span aria-hidden="true">▶</span>
            <strong>Video pertanyaan belum dapat diputar</strong>
            <small>Periksa nama file pada questions.json.</small>
          </div>
        ) : (
          <video
            key={question.id}
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            onPlay={() => onPlaybackChange?.(true)}
            onPause={() => onPlaybackChange?.(false)}
            onEnded={() => onPlaybackChange?.(false)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <button className="secondary-button replay-button" onClick={replay} disabled={failed || disabled}>
        ↻ Putar ulang video
      </button>
    </section>
  );
}
