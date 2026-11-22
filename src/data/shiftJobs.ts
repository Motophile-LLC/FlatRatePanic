import type {
  BikeHotspot,
  JobDefinition,
  RankBadgeInfo,
  RepairOrderRecord,
  ToolDefinition,
  ToolId,
} from '@/types/game';

export const SECONDS_PER_BILLED_HOUR = 55;

export interface JobPacing {
  torqueSpeed: number;
  snapTimerPenalty: number;
  snapDamage: number;
  snapChaos: number;
  wrongToolTimerPenalty: number;
  wrongToolChaos: number;
  buddyPatience: number;
  buddyChaosPerSec: number;
  wiringFuseMs: number;
  wiringScrambleAtMs: number;
  radioBaseTempo: number;
}

const JOB_PACING: JobPacing[] = [
  {
    // Job 0 (Monday 8:00 AM): relaxed morning warm-up for new mechanics
    torqueSpeed: 48,
    snapTimerPenalty: 5,
    snapDamage: 65,
    snapChaos: 10,
    wrongToolTimerPenalty: 2,
    wrongToolChaos: 8,
    buddyPatience: 18,
    buddyChaosPerSec: 1.4,
    wiringFuseMs: 16000,
    wiringScrambleAtMs: 0,
    radioBaseTempo: 0.76,
  },
  {
    // Job 1 (Tuesday 11:30 AM): brisk mid-morning pace
    torqueSpeed: 64,
    snapTimerPenalty: 8,
    snapDamage: 95,
    snapChaos: 14,
    wrongToolTimerPenalty: 3,
    wrongToolChaos: 11,
    buddyPatience: 15,
    buddyChaosPerSec: 2.2,
    wiringFuseMs: 16000,
    wiringScrambleAtMs: 0,
    radioBaseTempo: 0.88,
  },
  {
    // Job 2 (Thursday 2:15 PM): afternoon rush hour
    torqueSpeed: 84,
    snapTimerPenalty: 12,
    snapDamage: 125,
    snapChaos: 18,
    wrongToolTimerPenalty: 4,
    wrongToolChaos: 14,
    buddyPatience: 12,
    buddyChaosPerSec: 3.0,
    wiringFuseMs: 13000,
    wiringScrambleAtMs: 0,
    radioBaseTempo: 1.04,
  },
  {
    // Job 3 (Friday 4:45 PM): true end-of-week waiter boss fight
    torqueSpeed: 108,
    snapTimerPenalty: 15,
    snapDamage: 155,
    snapChaos: 22,
    wrongToolTimerPenalty: 5,
    wrongToolChaos: 16,
    buddyPatience: 10,
    buddyChaosPerSec: 3.6,
    wiringFuseMs: 10500,
    wiringScrambleAtMs: 5500,
    radioBaseTempo: 1.2,
  },
];

export function getJobPacing(jobIndex: number): JobPacing {
  return JOB_PACING[Math.max(0, Math.min(JOB_PACING.length - 1, jobIndex))];
}

export const TOOLS: ToolDefinition[] = [
  {
    id: 'torque_wrench',
    name: 'Click Torque Wrench',
    shortName: 'Torque Wrench',
    hotkey: '1',
    color: '#38bdf8',
    description: 'Precision calibrated ft-lbs wrench. Do NOT lend to shop buddies.',
    wrongToolPenalty: 75,
    wrongToolQuip: 'You tried torquing an electrical harness and crushed a relay!',
  },
  {
    id: 'impact_gun',
    name: '1/2" Air Impact Gun',
    shortName: 'Impact Gun',
    hotkey: '2',
    color: '#ef4444',
    description: 'Ugga-dugga speed demon. Dangerous on aluminum drain plugs.',
    wrongToolPenalty: 165,
    wrongToolQuip: 'UGGA-DUGGA! You blasted an aluminum thread straight into orbit!',
  },
  {
    id: 'propane_torch',
    name: 'Propane Torch',
    shortName: 'Torch',
    hotkey: '3',
    color: '#f97316',
    description: 'Can’t be tight if it’s a liquid. Essential for seized studs.',
    wrongToolPenalty: 195,
    wrongToolQuip: 'FIRE IN THE BAY! Melted a brand-new wiring sleeve and eyebrow!',
  },
  {
    id: 'ez_out',
    name: 'EZ-Out Extractor',
    shortName: 'EZ-Out',
    hotkey: '4',
    color: '#eab308',
    description: 'Last-resort reverse flute saver after a snapped bolt disaster.',
    wrongToolPenalty: 110,
    wrongToolQuip: 'Jamming a reverse extractor into a good bolt chewed the head flat!',
  },
  {
    id: 'multimeter',
    name: 'Shop Multimeter',
    shortName: 'Multimeter',
    hotkey: '5',
    color: '#22c55e',
    description: 'Diagnose cursed aftermarket handlebars & wire-nut spaghetti.',
    wrongToolPenalty: 65,
    wrongToolQuip: 'Touching multimeter probes to hot exhaust melted the leads!',
  },
  {
    id: 'brake_cleaner',
    name: 'Brake Kleen Can',
    shortName: 'Brake Kleen',
    hotkey: '6',
    color: '#a855f7',
    description: 'High-pressure solvent blast for sludge, gaskets, and bad moods.',
    wrongToolPenalty: 85,
    wrongToolQuip: 'Sprayed Brake Kleen straight into your own safety goggles!',
  },
];

export const TOOL_MAP: Record<ToolId, ToolDefinition> = TOOLS.reduce(
  (acc, tool) => {
    acc[tool.id] = tool;
    return acc;
  },
  {} as Record<ToolId, ToolDefinition>,
);

export const HOTSPOT_POSITIONS: Record<BikeHotspot, [number, number, number]> = {
  engine: [0.42, 1.82, 0.16],
  handlebars: [1.14, 2.48, 0.16],
  exhaust: [-0.12, 1.48, 0.2],
  oil_pan: [0.42, 1.1, 0.2],
  rear_wheel: [-0.68, 1.56, 0.16],
};

export const HOTSPOT_LABELS: Record<BikeHotspot, string> = {
  engine: 'V-Twin Block',
  handlebars: 'Handlebars & Harness',
  exhaust: 'Exhaust Studs',
  oil_pan: 'Oil Drain Pan',
  rear_wheel: 'Rear Axle & Tire',
};

export const SHIFT_JOBS: JobDefinition[] = [
  {
    id: 'job-1-oil',
    dayLabel: 'MONDAY 8:00 AM',
    title: 'Warm-Up: Club Dyna Oil & Filter',
    bikeName: 'Club-Style Twin-Cam Dyna',
    bikeSprite: 'club-dyna',
    bikeColor: '#374151',
    customerName: 'Dyna Bro',
    customerPortrait: '/sprites/portraits/dynabro.png',
    customerNote:
      '"Just needs a quick oil change & rocker check before bike night. Definitely don’t touch the drain plug with an impact, Dick."',
    billedHours: 1.0,
    parSeconds: 75,
    buddyIntervalMin: 42,
    buddyIntervalMax: 58,
    socketDropChance: 0,
    steps: [
      {
        id: 'j1-clean',
        label: 'Blast Drain Sludge',
        instruction: 'Equip Brake Kleen [6] and spray the Oil Drain Pan.',
        hotspot: 'oil_pan',
        requiredTool: 'brake_cleaner',
        interactionType: 'hold',
        holdDuration: 1.2,
      },
      {
        id: 'j1-plug',
        label: 'Torque Drain Plug',
        instruction: 'Equip Torque Wrench [1] and hit the sweet spot on the Oil Pan.',
        hotspot: 'oil_pan',
        requiredTool: 'torque_wrench',
        interactionType: 'torque',
        targetWidth: 32,
      },
      {
        id: 'j1-rocker',
        label: 'Snug Rocker Cover',
        instruction: 'Equip Torque Wrench [1] and check the V-Twin Block.',
        hotspot: 'engine',
        requiredTool: 'torque_wrench',
        interactionType: 'torque',
        targetWidth: 30,
      },
    ],
  },
  {
    id: 'job-2-bars',
    dayLabel: 'TUESDAY 11:30 AM',
    title: 'Mid-Shift: Big-Wheel Bagger Bars',
    bikeName: 'Candy-Red Big-Wheel Bagger',
    bikeSprite: 'bigwheel-bagger',
    bikeColor: '#dc2626',
    customerName: 'Lone Wolf Larry',
    customerPortrait: '/sprites/portraits/customer-1.png',
    customerNote:
      '"Brought a cardboard box of eBay parts & internal-wired ape hangers. My cousin already hooked up half the blinkers!"',
    billedHours: 1.5,
    parSeconds: 85,
    buddyIntervalMin: 28,
    buddyIntervalMax: 40,
    socketDropChance: 0.08,
    steps: [
      {
        id: 'j2-riser',
        label: 'Loosen Riser Clamps',
        instruction: 'Equip Torque Wrench [1] on the Handlebars.',
        hotspot: 'handlebars',
        requiredTool: 'torque_wrench',
        interactionType: 'torque',
        targetWidth: 27,
      },
      {
        id: 'j2-wire',
        label: 'Internal Bar Harness',
        instruction: 'Equip Multimeter [5] and splice the Mystery Wiring Harness.',
        hotspot: 'handlebars',
        requiredTool: 'multimeter',
        interactionType: 'wiring',
      },
      {
        id: 'j2-snug',
        label: 'Zip Riser Mounts',
        instruction: 'Equip Impact Gun [2] to seat the Handlebar risers.',
        hotspot: 'handlebars',
        requiredTool: 'impact_gun',
        interactionType: 'torque',
        targetWidth: 25,
      },
    ],
  },
  {
    id: 'job-3-topend',
    dayLabel: 'THURSDAY 2:15 PM',
    title: 'Rush Hour: Seized Exhaust & Top-End',
    bikeName: 'Wrapped-Pipe Club Dyna',
    bikeSprite: 'club-dyna',
    bikeColor: '#2563eb',
    customerName: 'Big Tone',
    customerPortrait: '/sprites/portraits/customer-2.png',
    customerNote:
      '"Those wrapped exhaust studs haven’t moved since 2016. Book says 2 hours — don’t snap one!"',
    billedHours: 2.0,
    parSeconds: 90,
    buddyIntervalMin: 17,
    buddyIntervalMax: 25,
    socketDropChance: 0.15,
    steps: [
      {
        id: 'j3-heat',
        label: 'Heat Exhaust Studs',
        instruction: 'Equip Propane Torch [3] to cherry-red the Exhaust Studs.',
        hotspot: 'exhaust',
        requiredTool: 'propane_torch',
        interactionType: 'hold',
        holdDuration: 1.45,
      },
      {
        id: 'j3-clean',
        label: 'Degrease Gasket Deck',
        instruction: 'Equip Brake Kleen [6] on the V-Twin Block.',
        hotspot: 'engine',
        requiredTool: 'brake_cleaner',
        interactionType: 'hold',
        holdDuration: 1.25,
      },
      {
        id: 'j3-exhaust',
        label: 'Torque Exhaust Flange',
        instruction: 'Equip Torque Wrench [1] on Exhaust Studs.',
        hotspot: 'exhaust',
        requiredTool: 'torque_wrench',
        interactionType: 'torque',
        targetWidth: 22,
      },
      {
        id: 'j3-head',
        label: 'Final Head Bolts',
        instruction: 'Equip Torque Wrench [1] on the V-Twin Block.',
        hotspot: 'engine',
        requiredTool: 'torque_wrench',
        interactionType: 'torque',
        targetWidth: 20,
      },
    ],
  },
  {
    id: 'job-4-waiter',
    dayLabel: 'FRIDAY 4:45 PM WAITER',
    title: 'BOSS FIGHT: Track Bagger Alarm & Tire',
    bikeName: 'Orange & Black Track Bagger',
    bikeSprite: 'track-bagger',
    bikeColor: '#f97316',
    customerName: 'Route 66 Gary',
    customerPortrait: '/sprites/portraits/customer-3.png',
    customerNote:
      '"I’ve got a paper map, two phones, and zero patience! Fix my Scotch-Lok alarm & rear tire RIGHT NOW!"',
    billedHours: 2.5,
    parSeconds: 85,
    buddyIntervalMin: 11,
    buddyIntervalMax: 16,
    socketDropChance: 0.22,
    steps: [
      {
        id: 'j4-axle',
        label: 'Blast Rear Axle Nut',
        instruction: 'Equip Impact Gun [2] on the Rear Axle & Tire.',
        hotspot: 'rear_wheel',
        requiredTool: 'impact_gun',
        interactionType: 'torque',
        targetWidth: 19,
      },
      {
        id: 'j4-alarm',
        label: 'Hack-Job Alarm Wiring',
        instruction: 'Equip Multimeter [5] on Handlebars (watch for Scotch-Lok scramble!).',
        hotspot: 'handlebars',
        requiredTool: 'multimeter',
        interactionType: 'wiring',
        scrambleWires: true,
      },
      {
        id: 'j4-exhaust',
        label: 'Retighten Slip-On',
        instruction: 'Equip Torque Wrench [1] on the Exhaust.',
        hotspot: 'exhaust',
        requiredTool: 'torque_wrench',
        interactionType: 'torque',
        targetWidth: 18,
      },
      {
        id: 'j4-final',
        label: 'Final Axle Spec Torque',
        instruction: 'Equip Torque Wrench [1] on Rear Axle & Tire.',
        hotspot: 'rear_wheel',
        requiredTool: 'torque_wrench',
        interactionType: 'torque',
        targetWidth: 17,
      },
    ],
  },
];

export const SHOP_BUDDY_LINES: string[] = [
  'Hey bro, seen my 10mm socket? Think I left it on your lift.',
  'My cousin has a ’94 Dyna that makes that same knocking noise!',
  'Mind if I borrow your torque wrench as a breaker bar real quick?',
  'Whoa, is that bike supposed to smoke before you start it?',
  'Service writer says the customer just pulled up with donuts... wait no, complaints.',
  'Careful with that wire, looks like my uncle’s Scotch-Lok special!',
];

export function computeRankBadge(efficiency: number, shopDamageCost: number): RankBadgeInfo {
  if (efficiency >= 135 && shopDamageCost <= 100) {
    return {
      title: 'Flat Rate Legend',
      subtitle: 'Flagged 7 hours before lunch without breaking a single stud.',
      stamp: 'FLAGGED +++',
      accentColor: '#16a34a',
    };
  }
  if (efficiency >= 105 && shopDamageCost <= 250) {
    return {
      title: 'Certified Bay Ripper',
      subtitle: 'Fast hands, clean threads, minimal swearing at the parts counter.',
      stamp: 'SHIPPED ON TIME',
      accentColor: '#2563eb',
    };
  }
  if (shopDamageCost >= 500) {
    return {
      title: 'Warranty Voided',
      subtitle: 'Insurance called twice and the fire extinguisher is still warm.',
      stamp: 'HR MEETING',
      accentColor: '#dc2626',
    };
  }
  if (efficiency >= 95) {
    return {
      title: 'Impact Gun Enthusiast',
      subtitle: 'Fast as lightning, loud as thunder, questionable thread survival.',
      stamp: 'UGGA DUGGA',
      accentColor: '#ea580c',
    };
  }
  if (shopDamageCost >= 220) {
    return {
      title: 'Master of JB Weld',
      subtitle: 'If nobody pulls on that bracket too hard, it’ll hold till Tuesday.',
      stamp: 'DO NOT TOUCH',
      accentColor: '#d97706',
    };
  }
  return {
    title: 'Needs Supervision',
    subtitle: 'Still searching under the rolling chest for that 10mm.',
    stamp: 'PAID HOURLY',
    accentColor: '#6b7280',
  };
}

export const FALLBACK_LEADERBOARD: RepairOrderRecord[] = [
  {
    id: 'seed-1',
    mechanic_name: 'Big Dale',
    billed_hours: 7.0,
    actual_hours: 4.95,
    efficiency_rating: 141.41,
    shop_damage_cost: 45,
    rank_badge: 'Flat Rate Legend',
    jobs_completed: 4,
  },
  {
    id: 'seed-2',
    mechanic_name: '10mm Johnny',
    billed_hours: 7.0,
    actual_hours: 6.1,
    efficiency_rating: 114.75,
    shop_damage_cost: 140,
    rank_badge: 'Certified Bay Ripper',
    jobs_completed: 4,
  },
  {
    id: 'seed-3',
    mechanic_name: 'JB Weld Rick',
    billed_hours: 7.0,
    actual_hours: 6.85,
    efficiency_rating: 102.19,
    shop_damage_cost: 320,
    rank_badge: 'Master of JB Weld',
    jobs_completed: 4,
  },
  {
    id: 'seed-4',
    mechanic_name: 'Rookie Tim',
    billed_hours: 7.0,
    actual_hours: 8.75,
    efficiency_rating: 80.0,
    shop_damage_cost: 590,
    rank_badge: 'Warranty Voided',
    jobs_completed: 4,
  },
];
