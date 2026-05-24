import Image from 'next/image';

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export default function Logo({ width = 120, height = 60, className = '' }: LogoProps) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-lg bg-[#001144] ${className}`}
      style={{ width: width + 16, height: height + 10, padding: '5px 8px' }}
    >
      <Image
        src="/logo.svg"
        alt="CollaBrains"
        width={width}
        height={height}
        priority
      />
    </div>
  );
}
