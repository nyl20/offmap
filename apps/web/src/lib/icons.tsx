import {
  VinylRecordIcon,
  MartiniIcon,
  BankIcon,
  PaintBrushIcon,
  MaskHappyIcon,
  TreeIcon,
  BowlFoodIcon,
  BuildingsIcon,
  BookOpenIcon,
  FlowerLotusIcon,
  TShirtIcon,
  ShoppingBagIcon,
  MapPinIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon, IconProps } from '@phosphor-icons/react/lib';

import type { OffmapCategory } from '@offmap/shared';

// The category -> icon mapping is web-specific (Phosphor is a React
// component library), so it lives here rather than in packages/shared
// alongside the rest of the category metadata.
export const CATEGORY_ICONS: Record<OffmapCategory, Icon> = {
  Music: VinylRecordIcon,
  Nightlife: MartiniIcon,
  'Visual Arts & Museums': BankIcon,
  'Arts & Crafts': PaintBrushIcon,
  'Arts & Performance': MaskHappyIcon,
  'Outdoors & Nature': TreeIcon,
  'Food & Drink': BowlFoodIcon,
  'Community & Culture': BuildingsIcon,
  'Talks & Education': BookOpenIcon,
  Wellness: FlowerLotusIcon,
  Fashion: TShirtIcon,
  Shopping: ShoppingBagIcon,
};

type CategoryIconProps = { category: string } & Omit<IconProps, 'ref'>;

// Duotone by default — this is the "illustrative centerpiece" tier (category
// tiles/chips, card fallback art, empty states). Pass weight="regular" for
// compact inline use.
export function CategoryIcon({ category, weight = 'duotone', ...props }: CategoryIconProps) {
  const Cmp = CATEGORY_ICONS[category as OffmapCategory] ?? MapPinIcon;
  return <Cmp weight={weight} {...props} />;
}
