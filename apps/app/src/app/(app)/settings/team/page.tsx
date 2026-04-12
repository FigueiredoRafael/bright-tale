'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { UserPlus, MoreHorizontal, Shield, Crown, Eye, User } from 'lucide-react';

interface Member {
  id: string;
  user_id: string;
  role: string;
  credit_limit: number | null;
  credits_used_cycle: number;
  accepted_at: string | null;
  created_at: string;
  user_profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

interface OrgInfo {
  id: string;
  name: string;
  role: string;
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'text-amber-500' },
  admin: { label: 'Admin', icon: Shield, color: 'text-blue-500' },
  member: { label: 'Member', icon: User, color: 'text-green-500' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-gray-500' },
};

function getInitials(member: Member): string {
  const profile = member.user_profiles;
  if (profile?.first_name) {
    return (profile.first_name[0] + (profile.last_name?.[0] ?? '')).toUpperCase();
  }
  if (profile?.email) {
    return profile.email[0].toUpperCase();
  }
  return '?';
}

function getDisplayName(member: Member): string {
  const profile = member.user_profiles;
  if (profile?.first_name) {
    return `${profile.first_name} ${profile.last_name ?? ''}`.trim();
  }
  return profile?.email ?? 'Unknown';
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [orgRes, membersRes] = await Promise.all([
        fetch('/api/org'),
        fetch('/api/org/members'),
      ]);
      const orgJson = await orgRes.json();
      const membersJson = await membersRes.json();

      if (orgJson.data) setOrg(orgJson.data);
      if (membersJson.data?.members) setMembers(membersJson.data.members);
    } catch {
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);

    try {
      const res = await fetch('/api/org/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error.message);
      } else {
        toast.success(`Invite sent to ${inviteEmail}`);
        setInviteOpen(false);
        setInviteEmail('');
        setInviteRole('member');
      }
    } catch {
      toast.error('Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleChangeRole(userId: string, newRole: string) {
    try {
      const res = await fetch(`/api/org/members/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error.message);
      } else {
        toast.success('Role updated');
        fetchData();
      }
    } catch {
      toast.error('Failed to update role');
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from the organization?`)) return;

    try {
      const res = await fetch(`/api/org/members/${userId}`, { method: 'DELETE' });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error.message);
      } else {
        toast.success(`${name} removed`);
        fetchData();
      }
    } catch {
      toast.error('Failed to remove member');
    }
  }

  const canManageTeam = org?.role === 'owner' || org?.role === 'admin';
  const canChangeRoles = org?.role === 'owner';

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground text-sm">
            {org?.name} &middot; {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>

        {canManageTeam && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleInvite}>
                <DialogHeader>
                  <DialogTitle>Invite a team member</DialogTitle>
                  <DialogDescription>
                    Send an invite to join {org?.name}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="colleague@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-role">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={inviting}>
                    {inviting ? 'Sending...' : 'Send invite'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members</CardTitle>
          <CardDescription>People with access to this organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {members.map((member) => {
              const roleConfig = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.member;
              const RoleIcon = roleConfig.icon;

              return (
                <div key={member.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={member.user_profiles?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{getInitials(member)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">{getDisplayName(member)}</div>
                      <div className="text-xs text-muted-foreground">
                        {member.user_profiles?.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <RoleIcon className={`h-3 w-3 ${roleConfig.color}`} />
                      {roleConfig.label}
                    </Badge>

                    {!member.accepted_at && (
                      <Badge variant="secondary">Pending</Badge>
                    )}

                    {canManageTeam && member.role !== 'owner' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canChangeRoles && (
                            <>
                              {member.role !== 'admin' && (
                                <DropdownMenuItem onClick={() => handleChangeRole(member.user_id, 'admin')}>
                                  Make Admin
                                </DropdownMenuItem>
                              )}
                              {member.role !== 'member' && (
                                <DropdownMenuItem onClick={() => handleChangeRole(member.user_id, 'member')}>
                                  Make Member
                                </DropdownMenuItem>
                              )}
                              {member.role !== 'viewer' && (
                                <DropdownMenuItem onClick={() => handleChangeRole(member.user_id, 'viewer')}>
                                  Make Viewer
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleRemove(member.user_id, getDisplayName(member))}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
