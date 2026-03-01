import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';

interface WrapperOptions {
  routerProps?: MemoryRouterProps;
}

function createWrapper(options: WrapperOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter {...options.routerProps}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions & { wrapperOptions?: WrapperOptions },
) {
  const { wrapperOptions, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: createWrapper(wrapperOptions),
    ...renderOptions,
  });
}
