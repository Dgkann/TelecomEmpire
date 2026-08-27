import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MapIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z" />
      <path d="M8 4v13M16 7v13" />
    </IconBase>
  );
}

export function NetworkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="m7 11 9-4M7 13l10 4M18 8v8" />
    </IconBase>
  );
}

export function CompanyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 21V8l8-4v17M12 10l8-3v14M2 21h20" />
      <path d="M7 11h2M7 15h2M15 11h2M15 15h2" />
    </IconBase>
  );
}

export function ResearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
      <path d="M7.5 16h9" />
    </IconBase>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 3h12l2 2v16H5Z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </IconBase>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.8.5-1.3 1-1.3 2M12 17h.01" />
    </IconBase>
  );
}

export function ExitIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 5H4v14h6M14 8l4 4-4 4M8 12h10" />
    </IconBase>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 3 9 5-9 5-9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </IconBase>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 2.8 20h18.4Z" />
      <path d="M12 9v5M12 17h.01" />
    </IconBase>
  );
}

export function SoundIcon({ off = false, ...props }: IconProps & { off?: boolean }) {
  return (
    <IconBase {...props}>
      <path d="M5 9H2v6h3l5 4V5Z" />
      {off ? (
        <path d="m15 10 5 5m0-5-5 5" />
      ) : (
        <>
          <path d="M14 9.5a4 4 0 0 1 0 5M17 7a7 7 0 0 1 0 10" />
        </>
      )}
    </IconBase>
  );
}
