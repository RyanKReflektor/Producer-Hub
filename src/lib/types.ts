export type UserRole = 'producer' | 'contributor'
export type PersonType = 'employee' | 'freelancer'
export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'pitch'
export type EntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type BudgetType = 'hours' | 'dollars'

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  person_type: PersonType | null
  title: string | null
  tags: string[]
  avatar_url: string | null
  internal_rate: number | null
  external_rate: number | null
  daily_hours: number
  color: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  name: string
  client: string
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  budget_type: BudgetType | null
  budget_value: number | null
  currency: string
  color: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectAssignment {
  id: string
  project_id: string
  person_id: string
  estimated_hours: number | null
  internal_rate_override: number | null
  external_rate_override: number | null
  assigned_at: string
  profile?: Profile
  project?: Project
}

export interface TimeEntry {
  id: string
  person_id: string
  project_id: string
  date: string
  hours: number
  description: string | null
  status: EntryStatus
  week_number: number
  year: number
  submitted_at: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
  profile?: Profile
  project?: Project
}

export interface ProjectBurnSummary {
  project_id: string
  total_hours: number
  internal_cost: number
  external_cost: number
  week_breakdown: {
    year: number
    week_number: number
    hours: number
    internal_cost: number
    external_cost: number
  }[]
  person_breakdown: {
    person_id: string
    name: string
    hours: number
    internal_cost: number
    external_cost: number
  }[]
}

export type LinkTool = 'slack' | 'notion' | 'drive' | 'other'

export interface ProjectLink {
  id: string
  project_id: string
  tool: LinkTool
  label: string
  url: string
  producer_only: boolean
  added_by: string
  added_at: string
}

export type ExpenseType =
  | 'hosting'
  | 'travel'
  | 'accommodation'
  | 'per_diem'
  | 'freelancer_flat'
  | 'software'
  | 'purchase'
  | 'other'

export interface Expense {
  id: string
  project_id: string
  expense_type: ExpenseType
  label: string
  amount: number
  quantity: number
  notes: string | null
  added_by: string | null
  added_at: string
}

export type TimeOffType = 'vacation' | 'holiday' | 'sick' | 'other'
export type ResourcePersonKind = 'placeholder' | 'vendor'

export interface ResourcePerson {
  id: string
  name: string
  kind: ResourcePersonKind
  title: string | null
  tags: string[]
  color: string | null
  daily_hours: number
  active: boolean
  created_by: string | null
  created_at: string
}

export interface ResourceAllocation {
  id: string
  person_id: string | null
  resource_person_id: string | null
  project_id: string
  start_date: string
  end_date: string
  hours_per_day: number
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TimeOff {
  id: string
  person_id: string | null
  resource_person_id: string | null
  start_date: string
  end_date: string
  type: TimeOffType
  note: string | null
  created_by: string | null
  created_at: string
}

export interface Milestone {
  id: string
  project_id: string
  name: string
  date: string
}
