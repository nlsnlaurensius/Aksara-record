interface BodyGuideProps {
  ready: boolean;
}

export function BodyGuide({ ready }: BodyGuideProps) {
  return (
    <svg
      className={`body-guide ${ready ? 'is-ready' : ''}`}
      viewBox="0 0 720 960"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Garis panduan posisi kepala, leher, bahu, dan tubuh bagian atas"
    >
      <path
        d="M360 58 C245 58 192 145 192 252 C192 356 254 428 360 428 C466 428 528 356 528 252 C528 145 475 58 360 58 Z"
      />
      <path d="M266 395 L266 475 C180 495 93 535 28 592 C10 690 4 800 8 920 L712 920 C716 800 710 690 692 592 C627 535 540 495 454 475 L454 395" />
    </svg>
  );
}
