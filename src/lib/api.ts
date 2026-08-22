import { supabase } from '@/lib/supabase';
import type {
  Customer,
  Property,
  Reminder,
  Task,
  Proposal,
  ReadyToBill,
  PaymentStatus,
  Photo,
  VoiceRecording,
  TypedEntry,
  Visit,
  VisitWithRelations,
  CustomerFact,
  CustomerFactType,
  Suggestion,
  Project,
  AdminUser,
  AdminStats,
} from '@/lib/types';

export interface CustomerContextArtifact {
  artifact_type: 'visit' | 'task' | 'proposal' | 'fact';
  artifact_id: string;
  label: string;
}

export interface CustomerContext {
  customer_id: string;
  customer_name: string;
  properties: { id: string; name: string | null; address: string | null }[];
  visits: {
    id: string;
    date: string;
    summary: string | null;
    service_type: string | null;
    property_name: string | null;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
    visit_id: string;
  }[];
  proposals: {
    id: string;
    title: string | null;
    price_text: string | null;
    description: string | null;
    status: string;
    visit_id: string;
  }[];
  facts: {
    id: string;
    type: CustomerFactType;
    value: string;
    source_visit_id: string | null;
  }[];
  photo_captions: string[];
}

export async function fetchReminders(): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('done', false)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase.from('properties').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function fetchVisit(id: string): Promise<VisitWithRelations | null> {
  const { data, error } = await supabase
    .from('visits')
    .select('*, customer:customers(*), property:properties(*), project:projects(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [voice, typed, photos, tasks, proposals, readyToBill] = await Promise.all([
    supabase.from('voice_recordings').select('*').eq('visit_id', id),
    supabase.from('typed_entries').select('*').eq('visit_id', id).order('created_at'),
    supabase.from('photos').select('*').eq('visit_id', id).order('created_at'),
    supabase.from('tasks').select('*').eq('visit_id', id).order('created_at'),
    supabase.from('proposals').select('*').eq('visit_id', id).order('created_at'),
    supabase.from('ready_to_bill').select('*').eq('visit_id', id).order('created_at'),
  ]);

  return {
    ...(data as Visit),
    customer: (data as { customer?: Customer | null }).customer ?? null,
    property: (data as { property?: Property | null }).property ?? null,
    voice_recordings: (voice.data as VoiceRecording[]) ?? [],
    typed_entries: (typed.data as TypedEntry[]) ?? [],
    photos: (photos.data as Photo[]) ?? [],
    tasks: (tasks.data as Task[]) ?? [],
    proposals: (proposals.data as Proposal[]) ?? [],
    ready_to_bill: (readyToBill.data as ReadyToBill[]) ?? [],
  };
}

export async function startVisit(input: {
  customer_id?: string | null;
  property_id?: string | null;
  service_type?: string | null;
}): Promise<Visit> {
  const { data, error } = await supabase
    .from('visits')
    .insert({ ...input, status: 'active' })
    .select()
    .single();
  if (error) throw error;
  return data as Visit;
}

// Called when the owner backs out of an active visit that captured
// nothing — no voice, no typed notes, no photos. Rather than leave a
// blank visit sitting in history, stats, and recent-visits lists forever,
// silently discard it. Best-effort: a failure here shouldn't block the
// owner from leaving the screen, so callers should swallow errors.
export async function discardEmptyVisit(visitId: string): Promise<void> {
  const { error } = await supabase.from('visits').delete().eq('id', visitId);
  if (error) throw error;
}

export async function addTypedEntry(visit_id: string, body: string): Promise<TypedEntry> {
  const { data, error } = await supabase
    .from('typed_entries')
    .insert({ visit_id, body })
    .select()
    .single();
  if (error) throw error;
  return data as TypedEntry;
}

export async function addVoiceRecording(
  visit_id: string,
  payload: { transcript: string; duration_sec: number; confidence?: number | null },
): Promise<VoiceRecording> {
  const { data, error } = await supabase
    .from('voice_recordings')
    .insert({
      visit_id,
      transcript: payload.transcript,
      duration_sec: payload.duration_sec,
      confidence: payload.confidence ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as VoiceRecording;
}

export async function transcribeAudio(
  audioBlob: Blob,
): Promise<{ transcript: string; confidence: number | null }> {
  const { data, error } = await supabase.functions.invoke('transcribe-visit', {
    body: audioBlob,
  });
  if (error) {
    const detail =
      (error as { message?: string }).message ??
      (typeof error === 'string' ? error : 'Transcription failed');
    throw new Error(detail);
  }
  const d = data as { transcript?: string; confidence?: number | null; error?: string };
  if (d.error) throw new Error(d.error);
  return { transcript: d.transcript ?? '', confidence: d.confidence ?? null };
}

export interface ExtractionResult {
  summary: string;
  tasks: { title: string; priority: string }[];
  proposal: { title: string; price_estimate: number; description: string } | null;
}

export async function extractVisit(visitId: string): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke('extract-visit', {
    body: { visit_id: visitId },
  });
  if (error) {
    const detail =
      (error as { message?: string }).message ??
      (typeof error === 'string' ? error : 'Extraction failed');
    throw new Error(detail);
  }
  const d = data as { error?: string } & Partial<ExtractionResult>;
  if (d.error) throw new Error(d.error);
  return {
    summary: d.summary ?? '',
    tasks: d.tasks ?? [],
    proposal: d.proposal ?? null,
  };
}

export interface VisitSummaryEmailPreview {
  subject: string;
  plainText: string;
  html: string;
}

export async function previewVisitSummaryEmail(
  visitId: string,
): Promise<VisitSummaryEmailPreview> {
  const { data, error } = await supabase.functions.invoke('send-visit-summary', {
    body: { visit_id: visitId, recipient: 'customer', preview: true },
  });
  if (error) throw new Error(error.message ?? 'Could not prepare email preview');
  const preview = data as Partial<VisitSummaryEmailPreview> & { error?: string };
  if (preview.error || !preview.subject || typeof preview.plainText !== 'string' || typeof preview.html !== 'string') {
    throw new Error(preview.error ?? 'Could not prepare email preview');
  }
  return { subject: preview.subject, plainText: preview.plainText, html: preview.html };
}

export async function sendVisitSummary(
  visitId: string,
  options: { recipient?: 'owner' | 'customer'; subject?: string; body_text?: string; body_html?: string } = {},
): Promise<{ success: boolean; sent_to: string }> {
  const { data, error } = await supabase.functions.invoke('send-visit-summary', {
    body: { visit_id: visitId, ...options },
  });
  if (error) {
    const d = error as { code?: string; message?: string };
    if (d.code === 'NO_SUMMARY_EMAIL' || d.code === 'NO_CONTACT_EMAIL') throw new Error(d.code);
    throw new Error(d.message ?? 'Failed to send summary');
  }
  const d = data as { error?: string; code?: string; success?: boolean; sent_to?: string };
  if (d?.code === 'NO_SUMMARY_EMAIL' || d?.error === 'NO_SUMMARY_EMAIL') throw new Error('NO_SUMMARY_EMAIL');
  if (d?.code === 'NO_CONTACT_EMAIL' || d?.error === 'NO_CONTACT_EMAIL') throw new Error('NO_CONTACT_EMAIL');
  if (d?.error) throw new Error(d.error);
  return { success: true, sent_to: d.sent_to ?? '' };
}

export async function addPhoto(visit_id: string, file: File): Promise<Photo> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error('Not authenticated');
  const userId = userData.user.id;

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `${userId}/${visit_id}/${filename}`;

  const { error: uploadErr } = await supabase.storage
    .from('visit-photos')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data, error } = await supabase
    .from('photos')
    .insert({ visit_id, storage_path: storagePath, caption: null })
    .select()
    .single();
  if (error) throw error;
  return data as Photo;
}

export async function updatePhotoCaption(photoId: string, caption: string): Promise<Photo> {
  const trimmed = caption.trim().slice(0, 140);
  const { data, error } = await supabase
    .from('photos')
    .update({ caption: trimmed || null })
    .eq('id', photoId)
    .select()
    .single();
  if (error) throw error;
  return data as Photo;
}

export async function getPhotoUrl(storagePath: string, expiresInSec = 3600): Promise<string | null> {
  const { data } = await supabase.storage
    .from('visit-photos')
    .createSignedUrl(storagePath, expiresInSec);
  return data?.signedUrl ?? null;
}

export async function getPhotoUrls(storagePaths: string[], expiresInSec = 3600): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    storagePaths.map(async (path) => {
      const url = await getPhotoUrl(path, expiresInSec);
      if (url) map.set(path, url);
    }),
  );
  return map;
}

export async function saveVisitSummary(
  visit_id: string,
  payload: { summary: string; status: 'summarized' | 'saved'; ended_at?: string },
): Promise<Visit> {
  const { data, error } = await supabase
    .from('visits')
    .update({ ...payload, ended_at: payload.ended_at ?? new Date().toISOString() })
    .eq('id', visit_id)
    .select()
    .single();
  if (error) throw error;
  return data as Visit;
}

export async function updateVisitSummaryText(visitId: string, summary: string): Promise<void> {
  const trimmed = summary.trim().slice(0, 5000);
  const { error } = await supabase
    .from('visits')
    .update({ summary: trimmed || null, edited: true })
    .eq('id', visitId);
  if (error) throw error;
}

export async function updateTaskTitle(taskId: string, title: string): Promise<void> {
  const trimmed = title.trim().slice(0, 500);
  if (!trimmed) return;
  const { error } = await supabase
    .from('tasks')
    .update({ title: trimmed, edited: true })
    .eq('id', taskId);
  if (error) throw error;
}

export async function toggleTask(task: Task): Promise<Task> {
  const next = task.status === 'open' ? 'done' : 'open';
  const patch: Record<string, unknown> = { status: next };
  if (next === 'done') patch.completed_at = new Date().toISOString();
  else patch.completed_at = null;
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', task.id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export interface OpenTask extends Task {
  customer_id: string | null;
  customer_name: string | null;
  property_name: string | null;
}

export async function fetchTasks(status: 'open' | 'done'): Promise<OpenTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, visit_id, customer_id, title, due_context, due_date, priority, status, created_at, completed_at, edited,
      visit:visits (
        customer_id, property_id,
        customer:customers ( name ),
        property:properties ( name )
      ),
      direct_customer:customers ( name )
    `)
    .eq('status', status)
    .order(status === 'done' ? 'completed_at' : 'created_at', { ascending: status !== 'done', nullsFirst: false })

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      visit_id: string | null;
      customer_id: string | null;
      title: string;
      due_context: string | null;
      due_date: string | null;
      priority: 'low' | 'medium' | 'high' | null;
      status: 'open' | 'done';
      created_at: string;
      completed_at: string | null;
      edited: boolean;
      visit: {
        customer_id: string | null;
        property_id: string | null;
        customer: { name: string | null } | null;
        property: { name: string | null } | null;
      } | null;
      direct_customer: { name: string | null } | null;
    };
    return {
      id: r.id,
      visit_id: r.visit_id,
      title: r.title,
      due_context: r.due_context,
      due_date: r.due_date,
      priority: r.priority,
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      edited: r.edited,
      customer_id: r.visit?.customer_id ?? r.customer_id ?? null,
      customer_name: r.visit?.customer?.name ?? r.direct_customer?.name ?? null,
      property_name: r.visit?.property?.name ?? null,
    };
  });
}

export async function fetchCustomerFacts(customerId: string): Promise<CustomerFact[]> {
  const { data, error } = await supabase
    .from('customer_facts')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomerFact[];
}

export async function createCustomerFact(input: {
  customer_id: string;
  type: CustomerFactType;
  value: string;
}): Promise<CustomerFact> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('customer_facts')
    .insert({
      customer_id: input.customer_id,
      user_id: userData.user.id,
      type: input.type,
      value: input.value.trim(),
      is_manual: true,
      source_visit_id: null,
      acknowledged: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CustomerFact;
}

export async function updateCustomerContactEmail(customerId: string, email: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ contact_email: email.trim() || null })
    .eq('id', customerId);
  if (error) throw error;
}

export async function updateCustomerFact(id: string, value: string): Promise<CustomerFact> {
  const { data, error } = await supabase
    .from('customer_facts')
    .update({ value: value.trim(), acknowledged: true })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CustomerFact;
}

export async function acknowledgeCustomerFact(id: string): Promise<void> {
  const { error } = await supabase
    .from('customer_facts')
    .update({ acknowledged: true })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCustomerFact(id: string): Promise<void> {
  const { error } = await supabase
    .from('customer_facts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function countVisitsToday(): Promise<number> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const { count, error } = await supabase
    .from('visits')
    .select('*', { count: 'exact', head: true })
    .gte('started_at', start.toISOString())
    .lte('started_at', end.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export interface OverdueProposal {
  id: string;
  visit_id: string;
  title: string | null;
  price_text: string | null;
  customer_name: string | null;
  created_at: string;
}

export async function fetchOverdueProposals(): Promise<OverdueProposal[]> {
  const { data, error } = await supabase
    .from('proposals')
    .select('id, visit_id, title, price_text, created_at, visits!inner(customer:customers(name))')
    .eq('status', 'draft')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => {
    const visit = p as unknown as { visits?: { customer?: { name?: string } | null } | null };
    const customerName = visit?.visits?.customer?.name ?? null;
    return {
      id: p.id,
      visit_id: p.visit_id,
      title: p.title,
      price_text: p.price_text,
      customer_name: customerName,
      created_at: p.created_at,
    };
  });
}

export interface CustomerWithStats extends Customer {
  property_count: number;
  visit_count: number;
  last_visit_at: string | null;
  properties: Property[];
}

export async function fetchCustomersWithStats(): Promise<CustomerWithStats[]> {
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('*')
    .order('name');
  if (custErr) throw custErr;

  const { data: properties, error: propErr } = await supabase
    .from('properties')
    .select('*');
  if (propErr) throw propErr;

  const { data: visits, error: visitErr } = await supabase
    .from('visits')
    .select('id, customer_id, property_id, started_at, service_type, status')
    .not('customer_id', 'is', null)
    .order('started_at', { ascending: false });
  if (visitErr) throw visitErr;

  const { data: tasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, visit_id, title, status, created_at')
    .order('created_at', { ascending: false });
  if (taskErr) throw taskErr;

  const { data: proposals, error: propStatusErr } = await supabase
    .from('proposals')
    .select('id, visit_id, title, status, created_at')
    .order('created_at', { ascending: false });
  if (propStatusErr) throw propStatusErr;

  const visitsByCustomer = new Map<string, Visit[]>();
  const visitIds = new Set<string>();
  (visits ?? []).forEach((v) => {
    const cid = v.customer_id as string;
    if (!visitsByCustomer.has(cid)) visitsByCustomer.set(cid, []);
    visitsByCustomer.get(cid)!.push(v as Visit);
    visitIds.add(v.id);
  });

  const tasksByVisit = new Map<string, Task[]>();
  (tasks ?? []).forEach((t) => {
    const vid = t.visit_id as string;
    if (!tasksByVisit.has(vid)) tasksByVisit.set(vid, []);
    tasksByVisit.get(vid)!.push(t as Task);
  });

  const proposalsByVisit = new Map<string, Proposal[]>();
  (proposals ?? []).forEach((p) => {
    const vid = p.visit_id as string;
    if (!proposalsByVisit.has(vid)) proposalsByVisit.set(vid, []);
    proposalsByVisit.get(vid)!.push(p as Proposal);
  });

  return (customers ?? []).map((c) => {
    const cust = c as Customer;
    const props = (properties ?? []).filter((p) => p.customer_id === cust.id) as Property[];
    const cVisits = visitsByCustomer.get(cust.id) ?? [];
    const lastVisit = cVisits[0]?.started_at ?? null;

    let nonVisitMilestones = 0;
    cVisits.forEach((v) => {
      nonVisitMilestones += (tasksByVisit.get(v.id) ?? []).filter((t) => t.status === 'done').length;
      nonVisitMilestones += (proposalsByVisit.get(v.id) ?? []).filter((p) => p.status === 'sent').length;
    });

    return {
      ...cust,
      property_count: props.length,
      visit_count: cVisits.length + nonVisitMilestones,
      last_visit_at: lastVisit,
      properties: props,
    };
  });
}

export interface VisitActivityItem {
  id: string;
  visit_id: string;
  type: 'visit' | 'task' | 'proposal' | 'project';
  label: string;
  started_at: string;
  property_id: string | null;
  property_name: string | null;
  property_address: string | null;
  customer_id: string | null;
  customer_name: string | null;
  project_id?: string | null;
  project_name?: string | null;
  visit_count?: number;
}

function visitLabel(serviceType: string | null, summary: string | null): string {
  if (summary && summary.trim()) {
    const firstSentence = summary.split(/[.\n]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= 80) return firstSentence;
    if (firstSentence.length > 80) return firstSentence.slice(0, 77) + '…';
  }
  return serviceType ?? 'Site visit';
}

export async function fetchCustomerActivity(customerId: string): Promise<{ visits: VisitActivityItem[]; propertyCount: number; visitCount: number; contactEmail: string | null }> {
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  const { data: properties } = await supabase
    .from('properties')
    .select('*')
    .eq('customer_id', customerId);

  const propMap = new Map<string, Property>();
  (properties ?? []).forEach((p) => propMap.set(p.id, p as Property));

  const { data: projects } = await supabase
    .from('projects')
    .select('id, customer_id, name, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  const projectMap = new Map<string, Project>();
  (projects ?? []).forEach((p) => projectMap.set(p.id, p as Project));

  const { data: visits } = await supabase
    .from('visits')
    .select('id, customer_id, property_id, project_id, started_at, service_type, status, summary')
    .eq('customer_id', customerId)
    .order('started_at', { ascending: false });

  const allVisits = (visits ?? []) as Visit[];
  const visitIds = allVisits.map((v) => v.id);
  if (visitIds.length === 0 && projectMap.size === 0) {
    return { visits: [], propertyCount: propMap.size, visitCount: 0, contactEmail: (customer as Customer)?.contact_email ?? null };
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, visit_id, title, status, created_at')
    .in('visit_id', visitIds.length > 0 ? visitIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false });

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, visit_id, title, status, created_at')
    .in('visit_id', visitIds.length > 0 ? visitIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false });

  const items: VisitActivityItem[] = [];
  const customerName = (customer as Customer)?.name ?? null;

  // TEMPORARY ROLLBACK (prod only): project-grouping rows disabled while
  // gauging organic demand. Project-assigned visits fall back to showing
  // as normal individual visits below (via `allVisits` instead of the
  // project-id filter) rather than collapsing into a project row. To
  // restore: un-comment this loop and change `allVisits.forEach` back to
  // `allVisits.filter((v) => !v.project_id).forEach`.
  //
  // for (const proj of projectMap.values()) {
  //   const projectVisits = allVisits.filter((v) => v.project_id === proj.id);
  //   if (projectVisits.length === 0) continue;
  //   const latestVisit = projectVisits[0];
  //   items.push({
  //     id: proj.id,
  //     visit_id: proj.id,
  //     type: 'project',
  //     label: proj.name,
  //     started_at: latestVisit.started_at,
  //     property_id: null,
  //     property_name: null,
  //     property_address: null,
  //     customer_id: customerId,
  //     customer_name: customerName,
  //     project_id: proj.id,
  //     project_name: proj.name,
  //     visit_count: projectVisits.length,
  //   });
  // }

  allVisits.forEach((v) => {
    const visit = v as Visit;
    const prop = visit.property_id ? propMap.get(visit.property_id) : null;
    items.push({
      id: visit.id,
      visit_id: visit.id,
      type: 'visit',
      label: visitLabel(visit.service_type, (visit as Visit).summary ?? null),
      started_at: visit.started_at,
      property_id: visit.property_id,
      property_name: prop?.name ?? null,
      property_address: prop?.address ?? null,
      customer_id: visit.customer_id,
      customer_name: customerName,
    });
  });

  (tasks ?? []).forEach((t) => {
    const task = t as Task;
    if (task.status !== 'done') return;
    const visit = allVisits.find((v) => v.id === task.visit_id);
    if (!visit) return;
    const prop = visit.property_id ? propMap.get(visit.property_id) : null;
    items.push({
      id: task.id,
      visit_id: visit.id,
      type: 'task',
      label: `Task completed: ${task.title}`,
      started_at: task.created_at,
      property_id: visit.property_id,
      property_name: prop?.name ?? null,
      property_address: prop?.address ?? null,
      customer_id: visit.customer_id,
      customer_name: customerName,
    });
  });

  (proposals ?? []).forEach((p) => {
    const prop = p as Proposal;
    if (prop.status !== 'sent') return;
    const visit = allVisits.find((v) => v.id === prop.visit_id);
    if (!visit) return;
    const propObj = visit.property_id ? propMap.get(visit.property_id) : null;
    items.push({
      id: prop.id,
      visit_id: visit.id,
      type: 'proposal',
      label: `Proposal sent: ${prop.title ?? 'Untitled'}`,
      started_at: prop.created_at,
      property_id: visit.property_id,
      property_name: propObj?.name ?? null,
      property_address: propObj?.address ?? null,
      customer_id: visit.customer_id,
      customer_name: customerName,
    });
  });

  items.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  return { visits: items, propertyCount: propMap.size, visitCount: allVisits.length, contactEmail: (customer as Customer)?.contact_email ?? null };
}

export async function fetchPropertyActivity(propertyId: string): Promise<{ visits: VisitActivityItem[]; customerName: string | null; visitCount: number }> {
  const { data: property } = await supabase
    .from('properties')
    .select('*, customer:customers(name)')
    .eq('id', propertyId)
    .maybeSingle();

  const prop = property as Property & { customer?: { name: string | null } | null } | null;
  const customerName = prop?.customer?.name ?? null;

  const { data: visits } = await supabase
    .from('visits')
    .select('id, customer_id, property_id, started_at, service_type, status, summary')
    .eq('property_id', propertyId)
    .order('started_at', { ascending: false });

  const visitIds = (visits ?? []).map((v) => v.id);
  if (visitIds.length === 0) {
    return { visits: [], customerName, visitCount: 0 };
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, visit_id, title, status, created_at')
    .in('visit_id', visitIds)
    .order('created_at', { ascending: false });

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, visit_id, title, status, created_at')
    .in('visit_id', visitIds)
    .order('created_at', { ascending: false });

  const items: VisitActivityItem[] = [];

  (visits ?? []).forEach((v) => {
    const visit = v as Visit;
    items.push({
      id: visit.id,
      visit_id: visit.id,
      type: 'visit',
      label: visitLabel(visit.service_type, (visit as Visit).summary ?? null),
      started_at: visit.started_at,
      property_id: visit.property_id,
      property_name: prop?.name ?? null,
      property_address: prop?.address ?? null,
      customer_id: visit.customer_id,
      customer_name: customerName,
    });
  });

  (tasks ?? []).forEach((t) => {
    const task = t as Task;
    if (task.status !== 'done') return;
    const visit = (visits ?? []).find((v) => v.id === task.visit_id) as Visit | undefined;
    if (!visit) return;
    items.push({
      id: task.id,
      visit_id: visit.id,
      type: 'task',
      label: `Task completed: ${task.title}`,
      started_at: task.created_at,
      property_id: visit.property_id,
      property_name: prop?.name ?? null,
      property_address: prop?.address ?? null,
      customer_id: visit.customer_id,
      customer_name: customerName,
    });
  });

  (proposals ?? []).forEach((p) => {
    const propRow = p as Proposal;
    if (propRow.status !== 'sent') return;
    const visit = (visits ?? []).find((v) => v.id === propRow.visit_id) as Visit | undefined;
    if (!visit) return;
    items.push({
      id: propRow.id,
      visit_id: visit.id,
      type: 'proposal',
      label: `Proposal sent: ${propRow.title ?? 'Untitled'}`,
      started_at: propRow.created_at,
      property_id: visit.property_id,
      property_name: prop?.name ?? null,
      property_address: prop?.address ?? null,
      customer_id: visit.customer_id,
      customer_name: customerName,
    });
  });

  items.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  return { visits: items, customerName, visitCount: (visits ?? []).length };
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  let q = supabase.from('customers').select('*').order('name');
  if (query.trim()) {
    q = q.ilike('name', `%${query.trim()}%`);
  }
  const { data, error } = await q.limit(20);
  if (error) throw error;
  return data ?? [];
}

export interface NearbyProperty {
  id: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  customer_id: string;
  customer_name: string;
  distance_m: number;
}

export async function fetchNearbyProperties(lat: number, lng: number, limit = 3): Promise<NearbyProperty[]> {
  const { data, error } = await supabase
    .from('properties')
    .select('id, name, address, latitude, longitude, customer_id, customer:customers(name)')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (error) throw error;

  const props = (data ?? []) as unknown as Array<{
    id: string;
    name: string | null;
    address: string | null;
    latitude: number;
    longitude: number;
    customer_id: string;
    customer: { name: string | null } | null;
  }>;

  return props
    .map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      customer_id: p.customer_id,
      customer_name: p.customer?.name ?? 'Unknown',
      distance_m: haversineMeters(lat, lng, p.latitude, p.longitude),
    }))
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);
}

export async function createCustomerWithProperty(input: {
  customer_name: string;
  property_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}): Promise<{ customer: Customer; property: Property }> {
  const { data: custData, error: custErr } = await supabase
    .from('customers')
    .insert({
      name: input.customer_name,
      contact_name: input.contact_name ?? null,
      contact_email: input.contact_email ?? null,
      contact_phone: input.contact_phone ?? null,
    })
    .select()
    .single();
  if (custErr) throw custErr;
  const customer = custData as Customer;

  const { data: propData, error: propErr } = await supabase
    .from('properties')
    .insert({
      customer_id: customer.id,
      name: input.property_name ?? null,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .select()
    .single();
  if (propErr) throw propErr;
  const property = propData as Property;

  return { customer, property };
}

export async function fetchPropertiesForCustomer(customerId: string): Promise<Property[]> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('customer_id', customerId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createPropertyForCustomer(input: {
  customer_id: string;
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<Property> {
  const { data, error } = await supabase
    .from('properties')
    .insert({
      customer_id: input.customer_id,
      name: input.name ?? null,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Property;
}

export async function deleteVisit(visitId: string): Promise<void> {
  const { error } = await supabase.from('visits').delete().eq('id', visitId);
  if (error) throw error;
}

export async function attachCustomerToVisit(
  visitId: string,
  customerId: string,
  propertyId: string,
): Promise<void> {
  const { error } = await supabase
    .from('visits')
    .update({ customer_id: customerId, property_id: propertyId })
    .eq('id', visitId);
  if (error) throw error;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export async function buildCustomerContext(customerIds: string[]): Promise<CustomerContext[]> {
  const contexts: CustomerContext[] = [];

  for (const customerId of customerIds) {
    const [custRes, propRes, visitRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).maybeSingle(),
      supabase.from('properties').select('id, name, address').eq('customer_id', customerId),
      supabase.from('visits').select('id, started_at, summary, service_type, customer_id, property_id').eq('customer_id', customerId).order('started_at', { ascending: true }),
    ]);

    const customer = custRes.data as Customer | null;
    const properties = (propRes.data ?? []) as { id: string; name: string | null; address: string | null }[];
    const visits = (visitRes.data ?? []) as {
      id: string;
      started_at: string;
      summary: string | null;
      service_type: string | null;
      customer_id: string | null;
      property_id: string | null;
    }[];

    const visitIds = visits.map((v) => v.id);
    const propMap = new Map(properties.map((p) => [p.id, p]));

    let tasks: { id: string; title: string; status: string; due_date: string | null; visit_id: string }[] = [];
    let proposals: { id: string; title: string | null; price_text: string | null; description: string | null; status: string; visit_id: string }[] = [];
    let photoCaptions: string[] = [];

    if (visitIds.length > 0) {
      const [taskRes, propRes2, photoRes] = await Promise.all([
        supabase.from('tasks').select('id, title, status, due_date, visit_id').in('visit_id', visitIds),
        supabase.from('proposals').select('id, title, price_text, description, status, visit_id').in('visit_id', visitIds),
        supabase.from('photos').select('caption, visit_id').in('visit_id', visitIds),
      ]);

      tasks = (taskRes.data ?? []) as { id: string; title: string; status: string; due_date: string | null; visit_id: string }[];
      proposals = (propRes2.data ?? []) as { id: string; title: string | null; price_text: string | null; description: string | null; status: string; visit_id: string }[];
      photoCaptions = (photoRes.data ?? [])
        .map((p: { caption?: string | null }) => p.caption)
        .filter((c: string | null | undefined): c is string => Boolean(c && c.trim()));
    }

    const factRes = await supabase.from('customer_facts').select('id, type, value, source_visit_id').eq('customer_id', customerId);
    const facts = (factRes.data ?? []) as { id: string; type: CustomerFactType; value: string; source_visit_id: string | null }[];

    contexts.push({
      customer_id: customerId,
      customer_name: customer?.name ?? 'Unknown customer',
      properties: properties.map((p) => ({ id: p.id, name: p.name, address: p.address })),
      visits: visits.map((v) => ({
        id: v.id,
        date: v.started_at,
        summary: v.summary,
        service_type: v.service_type,
        property_name: v.property_id ? (propMap.get(v.property_id)?.name ?? propMap.get(v.property_id)?.address ?? null) : null,
      })),
      tasks,
      proposals,
      facts,
      photo_captions: photoCaptions,
    });
  }

  return contexts;
}

export interface Citation {
  customer_id: string;
  artifact_type: 'visit' | 'task' | 'proposal' | 'fact';
  artifact_id: string;
  label: string;
}

export interface AskAtlasResponse {
  answer: string;
  citations: Citation[];
}

export async function askAtlas(question: string, contexts: CustomerContext[]): Promise<AskAtlasResponse> {
  const { data, error } = await supabase.functions.invoke('ask-atlas', {
    body: { question, contexts },
  });

  if (error) {
    const httpError = error as { context?: Response; message?: string };
    let detail: string | undefined;
    if (httpError.context) {
      try {
        const body = await httpError.context.json();
        detail = (body as { error?: string }).error;
      } catch {
        // response body wasn't JSON
      }
    }
    throw new Error(detail ?? httpError.message ?? 'Ask ServiceShadow failed');
  }
  return data as AskAtlasResponse;
}

export type StatsRange = 'week' | 'month' | 'all';

export interface StatsData {
  visitsLogged: number;
  activeCustomers: number;
  tasksOverdue: number;
  tasksCompleted: number;
  visitsByDay: { date: string; count: number }[];
  priorVisitsLogged: number;
  priorActiveCustomers: number;
  priorTasksCompleted: number;
}

function rangeBounds(range: StatsRange): { start: Date; end: Date; priorStart: Date; priorEnd: Date } {
  const now = new Date();
  if (range === 'week') {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const priorStart = new Date(start);
    priorStart.setDate(start.getDate() - 7);
    const priorEnd = new Date(start);
    return { start, end, priorStart, priorEnd };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const priorStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const priorEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, priorStart, priorEnd };
  }
  const start = new Date(0);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end, priorStart: start, priorEnd: start };
}

export async function fetchStats(range: StatsRange): Promise<StatsData> {
  const { start, end, priorStart, priorEnd } = rangeBounds(range);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [visitsRes, tasksOpenRes, tasksDoneRes, priorVisitsRes, priorDoneRes] = await Promise.all([
    supabase
      .from('visits')
      .select('id, customer_id, started_at')
      .gte('started_at', startIso)
      .lt('started_at', endIso)
      .order('started_at', { ascending: true }),
    supabase
      .from('tasks')
      .select('id, due_date, status')
      .eq('status', 'open'),
    supabase
      .from('tasks')
      .select('id, completed_at, status')
      .eq('status', 'done')
      .not('completed_at', 'is', null)
      .gte('completed_at', startIso)
      .lt('completed_at', endIso),
    range === 'all'
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('visits')
          .select('id, customer_id')
          .gte('started_at', priorStart.toISOString())
          .lt('started_at', priorEnd.toISOString()),
    range === 'all'
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('tasks')
          .select('id, completed_at, status')
          .eq('status', 'done')
          .not('completed_at', 'is', null)
          .gte('completed_at', priorStart.toISOString())
          .lt('completed_at', priorEnd.toISOString()),
  ]);

  if (visitsRes.error) throw visitsRes.error;
  if (tasksOpenRes.error) throw tasksOpenRes.error;
  if (tasksDoneRes.error) throw tasksDoneRes.error;
  if (priorVisitsRes.error) throw priorVisitsRes.error;
  if (priorDoneRes.error) throw priorDoneRes.error;

  const visits = (visitsRes.data ?? []) as { id: string; customer_id: string | null; started_at: string }[];
  const tasksOpen = (tasksOpenRes.data ?? []) as { id: string; due_date: string | null; status: string }[];
  const tasksDone = (tasksDoneRes.data ?? []) as { id: string; completed_at: string | null; status: string }[];
  const priorVisits = (priorVisitsRes.data ?? []) as { id: string; customer_id: string | null }[];
  const priorDone = (priorDoneRes.data ?? []) as { id: string; completed_at: string | null; status: string }[];

  const activeCustomerIds = new Set<string>();
  for (const v of visits) {
    if (v.customer_id) activeCustomerIds.add(v.customer_id);
  }

  const now = new Date();
  const todayIso = now.toISOString();
  let tasksOverdue = 0;
  for (const t of tasksOpen) {
    if (t.due_date && t.due_date < todayIso) tasksOverdue++;
  }

  const priorCustomerIds = new Set<string>();
  for (const v of priorVisits) {
    if (v.customer_id) priorCustomerIds.add(v.customer_id);
  }

  let visitsByDay: { date: string; count: number }[] = [];
  if (range === 'week') {
    const localDateKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const dayMap = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dayMap.set(localDateKey(d), 0);
    }
    for (const v of visits) {
      const key = localDateKey(new Date(v.started_at));
      if (dayMap.has(key)) dayMap.set(key, dayMap.get(key)! + 1);
    }
    visitsByDay = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
  }

  return {
    visitsLogged: visits.length,
    activeCustomers: activeCustomerIds.size,
    tasksOverdue,
    tasksCompleted: tasksDone.length,
    visitsByDay,
    priorVisitsLogged: priorVisits.length,
    priorActiveCustomers: priorCustomerIds.size,
    priorTasksCompleted: priorDone.length,
  };
}

// ── Suggestions ──────────────────────────────────────────────

const SUGGESTION_PRIORITY: Record<string, number> = {
  not_yet_sent: 0,
  payment_follow_up: 0,
  stale_proposal: 1,
  re_engage: 2,
  group_into_project: 3,
};
export async function fetchPendingSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from('suggestions')
    .select('id, customer_id, user_id, type, payload, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const suggestions = (data ?? []) as Suggestion[];
  return suggestions.sort((a, b) => {
    const priorityA = SUGGESTION_PRIORITY[a.type] ?? 99;
    const priorityB = SUGGESTION_PRIORITY[b.type] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function dismissSuggestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('suggestions')
    .update({ status: 'dismissed' })
    .eq('id', id);
  if (error) throw error;
}

export async function acceptSuggestionAsTask(
  suggestion: { id: string; customer_id: string },
  title: string,
): Promise<void> {
  const { error: taskError } = await supabase.from('tasks').insert({
    customer_id: suggestion.customer_id,
    source_suggestion_id: suggestion.id,
    title,
    status: 'open',
  });
  if (taskError) throw taskError;

  const { error: suggestionError } = await supabase
    .from('suggestions')
    .update({ status: 'accepted' })
    .eq('id', suggestion.id);
  if (suggestionError) throw suggestionError;
}

export async function createProjectFromSuggestion(suggestion: {
  id: string;
  customer_id: string;
  payload: Record<string, unknown> | null;
}): Promise<void> {
  const payload = suggestion.payload as
    | { customer_name?: string; property_name?: string; visit_ids?: string[] }
    | null;
  const visitIds = payload?.visit_ids;
  if (!visitIds || !Array.isArray(visitIds) || visitIds.length === 0) {
    throw new Error('No visits found for this suggestion');
  }

  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const projectName = payload?.property_name
    ? `${payload.property_name} — ${monthLabel}`
    : `${payload?.customer_name ?? 'Customer'} — ${monthLabel}`;

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({ customer_id: suggestion.customer_id, name: projectName })
    .select()
    .single();
  if (projectError) throw projectError;

  const { error: visitsError } = await supabase
    .from('visits')
    .update({ project_id: (project as { id: string }).id })
    .in('id', visitIds);
  if (visitsError) throw visitsError;

  const { error: suggestionError } = await supabase
    .from('suggestions')
    .update({ status: 'accepted' })
    .eq('id', suggestion.id);
  if (suggestionError) throw suggestionError;
}

// ── Recent visits (for Home) ──────────────────────────────────

export interface RecentVisit {
  id: string;
  started_at: string;
  customer_name: string | null;
  customer_id: string | null;
  property_name: string | null;
  property_count: number;
}

export async function fetchRecentVisits(limit = 3): Promise<RecentVisit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, started_at, customer_id, customer:customers(name), property:properties(name)')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    started_at: string;
    customer_id: string | null;
    customer: { name: string } | null;
    property: { name: string | null } | null;
  }[];

  if (rows.length === 0) return [];

  const customerIds = rows
    .map((r) => r.customer_id)
    .filter((id): id is string => id !== null);
  const uniqueCustomerIds = [...new Set(customerIds)];

  let propertyCountMap = new Map<string, number>();
  if (uniqueCustomerIds.length > 0) {
    const { data: propData, error: propError } = await supabase
      .from('properties')
      .select('customer_id')
      .in('customer_id', uniqueCustomerIds);
    if (!propError && propData) {
      for (const p of propData as { customer_id: string }[]) {
        propertyCountMap.set(p.customer_id, (propertyCountMap.get(p.customer_id) ?? 0) + 1);
      }
    }
  }

  return rows.map((r) => ({
    id: r.id,
    started_at: r.started_at,
    customer_name: r.customer?.name ?? null,
    customer_id: r.customer_id,
    property_name: r.property?.name ?? null,
    property_count: r.customer_id ? propertyCountMap.get(r.customer_id) ?? 0 : 0,
  }));
}

// ── Projects ─────────────────────────────────────────────────

export async function fetchProjectsForCustomer(customerId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, customer_id, user_id, name, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function createProject(customerId: string, name: string): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ customer_id: customerId, name })
    .select('id, customer_id, user_id, name, created_at')
    .single();
  if (error) throw error;
  return data as Project;
}

export async function setVisitProject(visitId: string, projectId: string | null): Promise<void> {
  const { error } = await supabase
    .from('visits')
    .update({ project_id: projectId })
    .eq('id', visitId);
  if (error) throw error;
}

// ── Admin ─────────────────────────────────────────────────────

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.functions.invoke('admin-list-users');
  if (error) {
    const detail = (error as { message?: string }).message ?? 'Failed to load users';
    throw new Error(detail);
  }
  const d = data as { users?: AdminUser[]; error?: string };
  if (d.error) throw new Error(d.error);
  return d.users ?? [];
}

export async function adminUpdateEmail(targetUserId: string, newEmail: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-update-email', {
    body: { target_user_id: targetUserId, new_email: newEmail },
  });
  if (error) {
    const detail = (error as { message?: string }).message ?? 'Failed to update email';
    throw new Error(detail);
  }
  const d = data as { error?: string; success?: boolean };
  if (d.error) throw new Error(d.error);
}

export async function adminSendOtp(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-send-otp', {
    body: { email },
  });
  if (error) {
    const detail = (error as { message?: string }).message ?? 'Failed to send code';
    throw new Error(detail);
  }
  const d = data as { error?: string; success?: boolean };
  if (d.error) throw new Error(d.error);
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.functions.invoke('admin-stats');
  if (error) {
    const detail = (error as { message?: string }).message ?? 'Failed to load stats';
    throw new Error(detail);
  }
  const d = data as { stats?: AdminStats; error?: string };
  if (d.error) throw new Error(d.error);
  return d.stats ?? ({} as AdminStats);
}

// ── Copy action (Handoff §1.3) ──────────────────────────────
export function formatVisitSummaryText(
  visit: VisitWithRelations,
  tasks: Task[],
): string {
  const customerName = visit.customer?.name ?? 'Customer';
  const propertyName = visit.property?.name;
  const visitDate = new Date(visit.started_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const proposal = visit.proposals?.[0];
  const readyToBill = visit.ready_to_bill?.[0];

  const lines: string[] = [];
  lines.push(`${customerName}${propertyName ? ` · ${propertyName}` : ''}`);
  lines.push(visitDate);
  lines.push('');
  lines.push(visit.summary ?? 'No summary was generated for this visit.');

  if (tasks.length > 0) {
    lines.push('');
    lines.push('TASKS');
    tasks.forEach((t) => {
      const due = t.due_date ? ` (due ${t.due_date})` : '';
      lines.push(`  • ${t.title}${due}`);
    });
  }

  if (proposal && proposal.title) {
    lines.push('');
    lines.push('PROPOSAL');
    lines.push(proposal.title);
    if (proposal.price_text) lines.push(`Price: ${proposal.price_text}`);
    if (proposal.description) {
      proposal.description.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) lines.push(`  • ${trimmed}`);
      });
    }
  }

  if (readyToBill && readyToBill.title) {
    lines.push('');
    lines.push('READY TO BILL');
    lines.push(readyToBill.title);
    if (readyToBill.amount != null) {
      lines.push(`Amount: ${readyToBill.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
    }
    if (readyToBill.description) {
      readyToBill.description.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) lines.push(`  • ${trimmed}`);
      });
    }
  }

  return lines.join('\n');
}

export async function updatePaymentStatus(
  readyToBillId: string,
  status: PaymentStatus,
): Promise<void> {
  const { error } = await supabase
    .from('ready_to_bill')
    .update({ payment_status: status })
    .eq('id', readyToBillId);
  if (error) throw error;
}

export interface OutstandingBillingItem {
  id: string;
  visit_id: string;
  title: string;
  amount: number | null;
  payment_status: PaymentStatus;
  created_at: string;
  customer_name: string;
  property_name: string | null;
}

export async function fetchOutstandingBilling(): Promise<OutstandingBillingItem[]> {
  const { data, error } = await supabase
    .from('ready_to_bill')
    .select(`
      id, visit_id, title, amount, payment_status, created_at,
      visit:visits ( customer:customers ( name ), property:properties ( name ) )
    `)
    .neq('payment_status', 'paid')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      visit_id: string;
      title: string;
      amount: number | null;
      payment_status: PaymentStatus;
      created_at: string;
      visit: {
        customer: { name: string | null } | null;
        property: { name: string | null } | null;
      } | null;
    };
    return {
      id: r.id,
      visit_id: r.visit_id,
      title: r.title,
      amount: r.amount,
      payment_status: r.payment_status,
      created_at: r.created_at,
      customer_name: r.visit?.customer?.name ?? 'Customer',
      property_name: r.visit?.property?.name ?? null,
    };
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function emailCsv(
  filename: string,
  headers: string[],
  rows: string[][],
  artifactType: 'customer_list' | 'task_list',
): Promise<{ sent_to: string }> {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));
  const csvContent = lines.join('\n');

  const { data, error } = await supabase.functions.invoke('export-csv', {
    body: { filename, csv_content: csvContent, artifact_type: artifactType },
  });
  if (error) {
    const detail = (error as { message?: string }).message ?? 'Failed to email export';
    throw new Error(detail);
  }
  const d = data as { sent_to?: string; error?: string };
  if (d.error) throw new Error(d.error);
  return { sent_to: d.sent_to ?? '' };
}

export async function shareVisitSummary(
  visit: VisitWithRelations,
  tasks: Task[],
): Promise<'shared' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unsupported';

  const text = formatVisitSummaryText(visit, tasks);
  const proposal = visit.proposals?.[0];
  const title = visit.customer?.name
    ? `${visit.customer.name} — Visit Summary`
    : 'Visit Summary';

  if (proposal && navigator.canShare && proposal.title) {
    try {
      const { data, error } = await supabase.functions.invoke('generate-proposal-pdf', {
        body: { visit_id: visit.id, mode: 'download' },
      });
      if (error) throw error;
      const pdfBase64 = (data as { pdf_base64?: string })?.pdf_base64;
      if (pdfBase64) {
        const binary = atob(pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const file = new File([bytes], 'proposal.pdf', { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, files: [file] });
          await logHandoffExport(proposal ? 'proposal' : 'visit_summary', visit.id, 'send');
          return 'shared';
        }
      }
    } catch {
      // fall through to text-only share
    }
  }

  await navigator.share({ title, text });
  await logHandoffExport(proposal ? 'proposal' : 'visit_summary', visit.id, 'send');
  return 'shared';
}

export async function logHandoffExport(
  artifactType: string,
  visitId: string | null,
  method: 'copy' | 'send',
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  await supabase.from('export_log').insert({
    user_id: userData.user.id,
    visit_id: visitId,
    artifact_type: artifactType,
    export_method: method,
    destination: null,
  });
}

export async function emailAccountExport(): Promise<{ sent_to: string }> {
  const { data, error } = await supabase.functions.invoke('export-account');
  if (error) {
    const detail = (error as { message?: string }).message ?? 'Failed to export account';
    throw new Error(detail);
  }
  const d = data as { sent_to?: string; error?: string };
  if (d.error) throw new Error(d.error);
  return { sent_to: d.sent_to ?? '' };
}

export async function emailProposalPdf(visitId: string): Promise<{ sent_to: string }> {
  const { data, error } = await supabase.functions.invoke('generate-proposal-pdf', {
    body: { visit_id: visitId },
  });
  if (error) {
    const detail = (error as { message?: string }).message ?? 'Failed to generate PDF';
    throw new Error(detail);
  }
  const d = data as { sent_to?: string; error?: string };
  if (d.error) throw new Error(d.error);
  return { sent_to: d.sent_to ?? '' };
}
