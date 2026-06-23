export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PeopleActions } from '@/components/people/people-actions'

export default async function PeoplePage() {
  const supabase = createAdminClient()

  const { data: people } = await supabase
    .from('profiles')
    .select('*')
    .order('name', { ascending: true })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">People</h1>
          <p className="text-sm text-neutral-500 mt-1">{(people || []).length} team member{(people || []).length !== 1 ? 's' : ''}</p>
        </div>
        <PeopleActions />
      </div>

      <div className="bg-white border border-neutral-200 rounded-[4px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Internal Rate</TableHead>
              <TableHead className="text-right">External Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!people || people.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-neutral-500 py-8">
                  No team members yet.
                </TableCell>
              </TableRow>
            ) : (
              people.map(person => (
                <TableRow key={person.id} className={!person.active ? 'opacity-50' : ''}>
                  <TableCell className="font-medium text-neutral-900">{person.name}</TableCell>
                  <TableCell className="text-neutral-600 text-sm">{person.email}</TableCell>
                  <TableCell>
                    <Badge variant={person.role === 'producer' ? 'submitted' : 'default'}>
                      {person.role === 'producer' ? 'Producer' : 'Contributor'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-neutral-600 text-sm capitalize">
                    {person.person_type ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-neutral-700">
                    {person.internal_rate ? formatCurrency(person.internal_rate) + '/hr' : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-neutral-700">
                    {person.external_rate ? formatCurrency(person.external_rate) + '/hr' : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={person.active ? 'active' : 'default'}>
                      {person.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <PeopleActions person={person} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
