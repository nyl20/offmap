import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

import styles from './button.module.css';

type Variant = 'primary' | 'secondary';

function classes(variant: Variant, block: boolean) {
  return [styles.btn, styles[variant], block ? styles.block : ''].filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  block?: boolean;
};

export function Button({ variant = 'primary', block = false, className, ...props }: ButtonProps) {
  return <button className={`${classes(variant, block)} ${className ?? ''}`} {...props} />;
}

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  block?: boolean;
};

export function LinkButton({ variant = 'primary', block = false, className, ...props }: LinkButtonProps) {
  return <a className={`${classes(variant, block)} ${className ?? ''}`} {...props} />;
}
