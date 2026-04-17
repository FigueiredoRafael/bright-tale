'use client';
import type { AffiliateAdminActions } from '@tn-figueiredo/affiliate-admin';
import {
  approve, pause, proposeChange, cancelProposal, renewContract,
} from './affiliates';
import {
  approvePayout, rejectPayout, completePayout,
} from './payouts';
import { reviewContent } from './content';
import { resolveFlag } from './fraud';
import {
  revalidateTaxId, addSocialLink, deleteSocialLink, verifySocialLinks,
} from './skipped-2f';

export const actions = {
  approve,
  pause,
  proposeChange,
  cancelProposal,
  renewContract,
  approvePayout,
  rejectPayout,
  completePayout,
  reviewContent,
  resolveFlag,
  revalidateTaxId,
  addSocialLink,
  deleteSocialLink,
  verifySocialLinks,
} satisfies AffiliateAdminActions;
