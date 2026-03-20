import React from 'react';
import Image from 'next/image';

interface ProviderIconProps {
  size?: number;
  className?: string;
}

export const OutlookProviderIcon: React.FC<ProviderIconProps> = ({ size = 16, className }) => (
  <Image
    src="/svgs/providers/outlook.svg"
    alt="Outlook"
    width={size}
    height={size}
    className={className}
  />
);

export const GoogleProviderIcon: React.FC<ProviderIconProps> = ({ size = 16, className }) => (
  <Image
    src="/svgs/providers/google.svg"
    alt="Google"
    width={size}
    height={size}
    className={className}
  />
);
