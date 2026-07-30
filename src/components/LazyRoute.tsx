import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";

type RouteModuleLoader = () => Promise<{ default: ComponentType }>;

interface LazyRouteProps {
  load: RouteModuleLoader;
  fallback?: ReactNode;
}

interface LoadState {
  Component: ComponentType | null;
  error: unknown;
}

const componentCache = new WeakMap<RouteModuleLoader, ComponentType>();
const promiseCache = new WeakMap<RouteModuleLoader, Promise<ComponentType>>();

function loadComponent(load: RouteModuleLoader): Promise<ComponentType> {
  const cached = componentCache.get(load);
  if (cached) return Promise.resolve(cached);

  const pending = promiseCache.get(load);
  if (pending) return pending;

  const promise = load()
    .then((module) => {
      componentCache.set(load, module.default);
      promiseCache.delete(load);
      return module.default;
    })
    .catch((error: unknown) => {
      promiseCache.delete(load);
      throw error;
    });

  promiseCache.set(load, promise);
  return promise;
}

export default function LazyRoute({ load, fallback = null }: LazyRouteProps) {
  const [state, setState] = useState<LoadState>(() => ({
    Component: componentCache.get(load) ?? null,
    error: null,
  }));

  useEffect(() => {
    let active = true;

    const cached = componentCache.get(load);
    if (cached) {
      if (state.Component !== cached) {
        setState({ Component: cached, error: null });
      }
      return () => {
        active = false;
      };
    }

    if (state.Component) {
      setState({ Component: null, error: null });
    }
    loadComponent(load).then(
      (Component) => {
        if (active) setState({ Component, error: null });
      },
      (error: unknown) => {
        if (active) setState({ Component: null, error });
      },
    );

    return () => {
      active = false;
    };
  }, [load, state.Component]);

  if (state.error) throw state.error;

  const Component = state.Component;
  return Component ? <Component /> : <>{fallback}</>;
}
