import React from 'react';
import type { PlanStatus } from '@/types/models';
import { Pill } from '@/components/ui';

export function StatusPill({ status }: { status: PlanStatus }) {
  switch (status) {
    case 'confirmed':
      return <Pill label="Confirmed" tone="success" icon="checkmark-circle" />;
    case 'completed':
      return <Pill label="Completed" tone="neutral" icon="flag" />;
    case 'canceled':
      return <Pill label="Canceled" tone="danger" icon="close-circle" />;
    default:
      return <Pill label="Planning" tone="warning" icon="time" />;
  }
}
