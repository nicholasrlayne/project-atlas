import { useState } from 'react';
import { Mic, Type, FileCheck } from 'lucide-react';

interface WalkthroughProps {
  onComplete: () => void;
}

interface Slide {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const slides: Slide[] = [
  {
    icon: (
      <div className="flex gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber/15 text-amber">
          <Mic size={20} />
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber/15 text-amber">
          <Type size={20} />
        </div>
      </div>
    ),
    title: 'Start a visit',
    body: 'Tap Start Visit, then just talk through what you did — or tap "Type Instead" if talking out loud isn\'t an option. No forms, no fields. Say it like you\'d tell a coworker.',
  },
  {
    icon: (
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber/15 text-amber">
        <FileCheck size={20} />
      </div>
    ),
    title: 'Review, then save',
    body: 'When you\'re done, ServiceShadow turns what you said into a summary and any follow-up tasks automatically. Glance it over, fix anything that looks off, and save — that\'s it.',
  },
];

export function Walkthrough({ onComplete }: WalkthroughProps) {
  const [step, setStep] = useState(0);
  const isLast = step === slides.length - 1;
  const slide = slides[step];

  return (
    <div className="flex flex-1 flex-col px-6 no-scrollbar">
      <div className="flex justify-end pt-4">
        <button onClick={onComplete} className="text-[12px] text-mist">
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="mb-5">{slide.icon}</div>
        <h1 className="mb-2 text-center font-head text-[20px] font-bold text-chalk">
          {slide.title}
        </h1>
        <p className="max-w-sm text-center text-[14px] leading-relaxed text-mist">
          {slide.body}
        </p>
      </div>

      <div className="mb-3 flex items-center justify-center gap-1.5">
        {slides.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? 'w-5 bg-amber' : 'w-1.5 bg-border-strong'
            }`}
          />
        ))}
      </div>

      <div className="mb-8 flex w-full max-w-sm gap-2.5 self-center">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="flex-1 rounded-[10px] border border-border-strong bg-cell py-3 text-center font-head text-[14px] font-semibold text-chalk"
          >
            Back
          </button>
        )}
        <button
          onClick={() => (isLast ? onComplete() : setStep((s) => s + 1))}
          className="flex-1 rounded-[10px] bg-amber py-3 text-center font-head text-[14px] font-semibold text-amber-ink"
        >
          {isLast ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  );
}
