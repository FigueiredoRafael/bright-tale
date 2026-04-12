'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  credits_total: number;
  credits_used: number;
  credits_addon: number;
  credits_reset_at: string | null;
  created_at: string;
  member_count: number;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  creator: 'bg-purple-100 text-purple-700',
  pro: 'bg-amber-100 text-amber-700',
};

const PLAN_CREDITS: Record<string, number> = {
  free: 1000,
  starter: 5000,
  creator: 10000,
  pro: 15000,
};

export function OrgsTable({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const [saving, setSaving] = useState(false);
  const [formPlan, setFormPlan] = useState('');
  const [formCreditsTotal, setFormCreditsTotal] = useState(0);
  const [formCreditsAddon, setFormCreditsAddon] = useState(0);

  function openEdit(org: Org) {
    setEditingOrg(org);
    setFormPlan(org.plan);
    setFormCreditsTotal(org.credits_total);
    setFormCreditsAddon(org.credits_addon);
  }

  async function handleSave() {
    if (!editingOrg) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/orgs/${editingOrg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: formPlan,
          credits_total: formCreditsTotal,
          credits_addon: formCreditsAddon,
        }),
      });

      const json = await res.json();
      if (json.error) {
        alert(json.error.message);
      } else {
        setEditingOrg(null);
        router.refresh();
      }
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetCredits(orgId: string) {
    if (!confirm('Reset credits used to 0?')) return;

    await fetch(`/api/admin/orgs/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credits_used: 0 }),
    });
    router.refresh();
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Organization</th>
              <th className="text-left p-3 font-medium">Plan</th>
              <th className="text-left p-3 font-medium">Credits</th>
              <th className="text-left p-3 font-medium">Members</th>
              <th className="text-left p-3 font-medium">Created</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orgs.map((org) => {
              const percentage = org.credits_total > 0
                ? Math.round((org.credits_used / org.credits_total) * 100)
                : 0;

              return (
                <tr key={org.id} className="hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-medium">{org.name}</div>
                    <div className="text-xs text-muted-foreground">{org.slug}</div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${PLAN_COLORS[org.plan] ?? 'bg-gray-100'}`}>
                      {org.plan}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${percentage >= 90 ? 'bg-red-500' : percentage >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {org.credits_used.toLocaleString()} / {org.credits_total.toLocaleString()}
                      </span>
                    </div>
                    {org.credits_addon > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        +{org.credits_addon.toLocaleString()} addon
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{org.member_count}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(org)}
                        className="px-2 py-1 text-xs rounded border hover:bg-muted transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleResetCredits(org.id)}
                        className="px-2 py-1 text-xs rounded border hover:bg-muted transition-colors text-amber-600"
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingOrg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">Edit {editingOrg.name}</h2>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Plan</label>
                <select
                  value={formPlan}
                  onChange={(e) => {
                    setFormPlan(e.target.value);
                    setFormCreditsTotal(PLAN_CREDITS[e.target.value] ?? formCreditsTotal);
                  }}
                  className="w-full border rounded px-3 py-2 text-sm bg-background"
                >
                  <option value="free">Free (1,000 credits)</option>
                  <option value="starter">Starter (5,000 credits)</option>
                  <option value="creator">Creator (10,000 credits)</option>
                  <option value="pro">Pro (15,000 credits)</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Credits Total</label>
                <input
                  type="number"
                  value={formCreditsTotal}
                  onChange={(e) => setFormCreditsTotal(parseInt(e.target.value, 10) || 0)}
                  className="w-full border rounded px-3 py-2 text-sm bg-background"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Addon Credits</label>
                <input
                  type="number"
                  value={formCreditsAddon}
                  onChange={(e) => setFormCreditsAddon(parseInt(e.target.value, 10) || 0)}
                  className="w-full border rounded px-3 py-2 text-sm bg-background"
                />
              </div>

              <div className="text-xs text-muted-foreground">
                Current usage: {editingOrg.credits_used.toLocaleString()} credits used this cycle
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingOrg(null)}
                className="px-4 py-2 text-sm rounded border hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
