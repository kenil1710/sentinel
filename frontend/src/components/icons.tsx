/**
 * Every icon the UI uses, in one place.
 *
 * ## The rule this file enforces
 *
 * An icon here SUPPLEMENTS a label; it never replaces one. Sentinel is a
 * compliance record — "33 breaches" and a red triangle mean different things to
 * different readers, and only the words are unambiguous. So every icon in this
 * codebase sits beside text, is marked `aria-hidden`, and is never the only
 * carrier of meaning. A screen reader that skips all of them loses nothing.
 *
 * ## Why a wrapper rather than importing lucide directly
 *
 * Size and weight are the whole difference between an icon that helps and one
 * that shouts. Left to call sites they drift: 16 here, 24 there, a bold stroke
 * next to a hairline. Routing everything through one component fixes the
 * defaults in a single place — 16px, 1.75 stroke, never filled — so the set
 * reads as one system, and `shrink-0` stops an icon deforming inside the flex
 * rows this UI is built from.
 */
import {
  AlertTriangle, ArrowDown, ArrowUp, BarChart3, BookOpen, Bot, CheckCircle,
  Clock, Coins, Eye, FileCheck, Hourglass, Link2, Lock, Play, Plus, Radar,
  Scale, Search, Shield, Swords, Trophy, UserPlus, Users, XCircle,
} from "lucide-react";

const REGISTRY = {
  agents: Users,
  patrol: Shield,
  analytics: BarChart3,
  watchers: Eye,
  docs: BookOpen,
  register: Plus,
  evidence: Search,
  step_register: UserPlus,
  step_patrol: Radar,
  step_challenge: Swords,
  step_judge: Scale,
  autonomous: Bot,
  trustless: Lock,
  accountable: FileCheck,
  bond: Coins,
  challenges: Swords,
  breaches: AlertTriangle,
  patrols: Radar,
  bounties: Trophy,
  chain: Link2,
  checked: Clock,
  on_duty: CheckCircle,
  deactivated: XCircle,
  run: Play,
  waiting: Hourglass,
  verify: CheckCircle,
  withdraw: ArrowDown,
  topup: ArrowUp,
} as const;

export type IconName = keyof typeof REGISTRY;

/** 16px is the default on purpose: it sits on the cap height of 13–14px text. */
export function Icon({ name, size = 16, strokeWidth = 1.75, className = "" }: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Glyph = REGISTRY[name];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    />
  );
}
