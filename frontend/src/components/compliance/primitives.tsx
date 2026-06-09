import { CheckCircle2, XCircle, AlertTriangle, MinusCircle } from 'lucide-react';

/** Shared status styling for compliance verdicts (pass/fail/warning/N-A). */
export const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Pass' },
  fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Fail' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Warning' },
  not_applicable: { icon: MinusCircle, color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200', label: 'N/A' },
} as const;

export type ComplianceStatus = keyof typeof STATUS_CONFIG;

/** Circular compliance score gauge (0–100). */
export function ScoreRing({ score, size = 128 }: { score: number; size?: number }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}%</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Compliance</span>
      </div>
    </div>
  );
}
