// mobile/src/screens/events/templates.ts
// Ported from project/riddhi/MobileStore.jsx:22 (EV_CAT_LIST), 41-60 (templates).

/** Categories offered for event line-items (expense side only). */
export const EV_CAT_LIST = [
  'Food & Dining', 'Entertainment', 'Shopping', 'Transport',
  'Housing', 'Utilities', 'Healthcare', 'Education', 'Other',
];

export interface TemplateItem {
  categoryName: string;
  label: string;
  planned: number;
}

export interface EventTemplate {
  key: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  items: TemplateItem[];
}

const item = (categoryName: string, label: string, planned: number): TemplateItem => ({ categoryName, label, planned });

export const EV_TEMPLATES: EventTemplate[] = [
  { key: 'birthday', name: 'Birthday Party', emoji: '🎂', color: '#c97d8c', budget: 25000, items: [
    item('Entertainment', 'Venue / play zone', 6000), item('Food & Dining', 'Custom cake', 2500),
    item('Food & Dining', 'Catering / snacks', 8000), item('Shopping', 'Balloons & decor', 3000),
    item('Shopping', 'Return gifts', 2500), item('Entertainment', 'DJ / music', 2000),
    item('Shopping', 'Invites & printing', 1000),
  ] },
  { key: 'wedding', name: 'Wedding', emoji: '💍', color: '#c9a86a', budget: 800000, items: [
    item('Entertainment', 'Banquet hall', 250000), item('Food & Dining', 'Catering', 300000),
    item('Entertainment', 'Photo & video', 120000), item('Shopping', 'Outfits & jewellery', 90000),
    item('Shopping', 'Stage & flowers', 80000), item('Entertainment', 'Band / DJ', 40000),
  ] },
  { key: 'trip', name: 'Trip / Vacation', emoji: '✈️', color: '#6fb3ad', budget: 60000, items: [
    item('Transport', 'Flights / train', 22000), item('Housing', 'Hotel stay', 18000),
    item('Food & Dining', 'Meals', 9000), item('Entertainment', 'Tours & tickets', 7000),
    item('Shopping', 'Shopping & misc', 4000),
  ] },
  { key: 'houseparty', name: 'House Party', emoji: '🎉', color: '#9d8bd6', budget: 12000, items: [
    item('Food & Dining', 'Drinks & beverages', 4000), item('Food & Dining', 'Snacks & food', 5000),
    item('Entertainment', 'Music / speaker', 1000), item('Shopping', 'Lights & props', 1500),
    item('Other', 'Supplies', 500),
  ] },
  { key: 'custom', name: 'Custom Event', emoji: '✨', color: '#b6a4f3', budget: 20000, items: [] },
];

/** Builds a NewEventInput-shaped seed from a template (labels, not ids). */
export function seedFromTemplate(t: EventTemplate) {
  return {
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    budget: t.budget,
    guests: 0,
    expenses: t.items.map((i) => ({ categoryName: i.categoryName, label: i.label, planned: i.planned })),
  };
}
