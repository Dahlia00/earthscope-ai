'use client';

import { motion } from 'motion/react';
import { useMotionPreference } from './useMotionPreference';
import type { ReactNode } from 'react';

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useMotionPreference();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 1, y: reduced ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{
        duration: reduced ? 0 : 0.65,
        delay: reduced ? 0 : delay,
        ease: [0.2, 0.65, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
