export type UserRole = 'producer' | 'contributor'
export type PersonType = 'employee' | 'freelancer'
export type ProjectStatus = 'active' | 'completed' | 'on_hold'
export type EntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type BudgetType = 'hours' | 'dollars'

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  person_type: PersonType | null
  avatar_url: string | null
  internal_rate: number | null
  external_rate: number | null
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
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectAssignment {
  id: string
  project_id: string
  person_id: string
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

// Phase 2
export interface ResourceAllocation {
  id: string
  person_id: string
  project_id: string
  week_number: number
  year: number
  planned_hours: number
}

export interface Milestone {
  id: string
  project_id: string
  name: string
  date: string
}
