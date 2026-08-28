import { GlobeIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react/ssr';

import { LinkButton } from '@/components/ui/button';
import styles from './action-buttons.module.css';

type ActionButtonsProps = {
  websiteUrl: string | null;
  directionsUrl: string;
};

export function ActionButtons({ websiteUrl, directionsUrl }: ActionButtonsProps) {
  return (
    <div className={styles.row}>
      {websiteUrl ? (
        <LinkButton href={websiteUrl} target="_blank" rel="noopener" variant="primary" block>
          <GlobeIcon weight="regular" size={14} />
          Website
        </LinkButton>
      ) : null}
      <LinkButton href={directionsUrl} target="_blank" rel="noopener" variant="secondary" block>
        <PaperPlaneTiltIcon weight="regular" size={14} />
        Directions
      </LinkButton>
    </div>
  );
}
