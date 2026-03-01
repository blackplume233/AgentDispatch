import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, PriorityBadge } from '@/components/common/status-badge';

describe('StatusBadge', () => {
  const statuses = ['pending', 'claimed', 'in_progress', 'completed', 'failed', 'cancelled'] as const;

  it.each(statuses)('renders "%s" status correctly', (status) => {
    render(<StatusBadge status={status} />);
    const expected = status.replace(/_/g, ' ');
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders client statuses', () => {
    render(<StatusBadge status="online" />);
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('renders offline status', () => {
    render(<StatusBadge status="offline" />);
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('handles unknown status gracefully', () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<StatusBadge status="pending" className="custom-class" />);
    expect(container.querySelector('.custom-class')).not.toBeNull();
  });
});

describe('PriorityBadge', () => {
  const priorities = ['low', 'normal', 'high', 'urgent'] as const;

  it.each(priorities)('renders "%s" priority correctly', (priority) => {
    render(<PriorityBadge priority={priority} />);
    expect(screen.getByText(priority)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<PriorityBadge priority="high" className="extra" />);
    expect(container.querySelector('.extra')).not.toBeNull();
  });
});
