'use client';

import { Check, Circle, Loader2 } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'System Identity' },
  { id: 2, label: 'DNS & Ports' },
  { id: 3, label: 'Admin Account' },
  { id: 4, label: 'Provisioning' },
  { id: 5, label: 'Ready' },
];

interface StepIndicatorProps {
  currentStep: number;
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center mb-10">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                step.id < currentStep
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : step.id === currentStep
                  ? 'border-blue-500 text-blue-500 bg-blue-50'
                  : 'border-slate-300 text-slate-400 bg-white'
              }`}
            >
              {step.id < currentStep ? (
                <Check size={18} />
              ) : step.id === currentStep ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Circle size={18} />
              )}
            </div>
            <span
              className={`mt-1 text-xs font-medium ${
                step.id <= currentStep ? 'text-slate-700' : 'text-slate-400'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-16 h-0.5 mx-1 mb-4 transition-all ${
                step.id < currentStep ? 'bg-emerald-500' : 'bg-slate-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
