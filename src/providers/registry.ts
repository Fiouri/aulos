import type { Capability, SourceProvider } from './types';

/**
 * The providers of this build, in display order, with a per-provider on/off switch (Settings →
 * Sources). The UI asks the registry for providers by capability, so adding a provider means
 * registering it here; no screen names a provider.
 */
export class ProviderRegistry {
  readonly #providers = new Map<string, SourceProvider>();
  readonly #disabled = new Set<string>();

  register(provider: SourceProvider): void {
    if (this.#providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} is already registered`);
    }
    this.#providers.set(provider.id, provider);
  }

  /** The provider, enabled or not; undefined when this build has no such provider. */
  get(id: string): SourceProvider | undefined {
    return this.#providers.get(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    if (enabled) this.#disabled.delete(id);
    else this.#disabled.add(id);
  }

  isEnabled(id: string): boolean {
    return this.#providers.has(id) && !this.#disabled.has(id);
  }

  /** Enabled providers, in registration order. */
  enabled(): SourceProvider[] {
    return [...this.#providers.values()].filter((p) => !this.#disabled.has(p.id));
  }

  withCapability(capability: Capability): SourceProvider[] {
    return this.enabled().filter((p) => p.capabilities.includes(capability));
  }

  /** Every registered provider, including disabled ones (for Settings). */
  all(): SourceProvider[] {
    return [...this.#providers.values()];
  }
}
