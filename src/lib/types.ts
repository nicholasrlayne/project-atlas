export type ServiceType =
  | 'landscaping'
  | 'pest_control'
  | 'irrigation'
  | 'dryer_vent_cleaning'
  | 'pressure_washing'
  | 'general';

export type VisitStatus = 'active' | 'summarized' | 'saved';
export type TaskStatus = 'open' | 'done';
export type ProposalStatus = 'draft' | 'sent';
export type ReminderUrgency = 'high' | 'normal';

export interface Customer {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  customer_id: string;
  name: string | null;
  address: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  customer_id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Visit {
  id: string;
  customer_id: string | null;
  property_id: string | null;
  project_id: string | null;
  service_type: ServiceType | null;
  status: VisitStatus;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceRecording {
  id: string;
  visit_id: string;
  transcript: string | null;
  duration_sec: number | null;
  confidence: number | null;
  created_at: string;
}

export interface TypedEntry {
  id: string;
  visit_id: string;
  body: string;
  created_at: string;
}

export interface Photo {
  id: string;
  visit_id: string;
  storage_path: string | null;
  caption: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  visit_id: string | null;
  title: string;
  due_context: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  status: TaskStatus;
  edited: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface Proposal {
  id: string;
  visit_id: string;
  title: string | null;
  price_text: string | null;
  price_estimate: number | null;
  description: string | null;
  status: ProposalStatus;
  created_at: string;
}

export type PaymentStatus = 'unreported' | 'paid' | 'waiting';

export interface ReadyToBill {
  id: string;
  visit_id: string;
  title: string;
  description: string | null;
  amount: number | null;
  payment_status: PaymentStatus;
  created_at: string;
}

export interface Reminder {
  id: string;
  customer_id: string | null;
  title: string;
  detail: string | null;
  urgency: ReminderUrgency;
  done: boolean;
  due_date: string | null;
  created_at: string;
}

export type CustomerFactType = 'decision_maker' | 'process' | 'renewal_timing' | 'upsell_opportunity' | 'cadence_override';

export interface CustomerFact {
  id: string;
  customer_id: string;
  type: CustomerFactType;
  value: string;
  source_visit_id: string | null;
  is_manual: boolean;
  previous_value: string | null;
  acknowledged: boolean;
  created_at: string;
  updated_at: string;
}

export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

export interface Suggestion {
  id: string;
  customer_id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  status: SuggestionStatus;
  created_at: string;
}

export interface Subscription {
  user_id: string;
  plan_name: string;
  status: string;
  monthly_amount_cents: number;
  current_period_end: string | null;
}

export interface AdminUser {
  user_id: string;
  email: string;
  full_name: string;
  business_name: string;
  summary_email: string | null;
  created_at: string;
  is_admin: boolean;
  last_sign_in_at: string | null;
  visit_count: number;
  stripe_customer_id: string | null;
  subscription: Subscription | null;
}

export interface AdminStats {
  total_users: number;
  active_users_30d: number;
  total_visits: number;
  total_tasks: number;
  open_tasks: number;
  completed_tasks: number;
  total_proposals: number;
  total_proposed_value: number;
  active_subscriptions: number;
  total_subscriptions: number;
  monthly_recurring_revenue_cents: number;
}

export interface VisitWithRelations extends Visit {
  customer?: Customer | null;
  property?: Property | null;
  project?: Project | null;
  voice_recordings?: VoiceRecording[];
  typed_entries?: TypedEntry[];
  photos?: Photo[];
  tasks?: Task[];
  proposals?: Proposal[];
  ready_to_bill?: ReadyToBill[];
}
