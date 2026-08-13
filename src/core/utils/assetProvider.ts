/**
 * Source-provider identity constants shared by the legacy importer, the Store
 * importer, discovery filters and the PDP. Every asset document carries a
 * `provider` and a provider-scoped `source_asset_id`; availability
 * reconciliation and identity lookups MUST always be provider-scoped so one
 * source can never hide another's records.
 */

import { AssetProvider } from 'app/utilities/fetchFromGodot/schema/assets'

export const GODOT_ASSET_LIBRARY_PROVIDER: AssetProvider = 'godot_asset_library'
export const GODOT_STORE_PROVIDER: AssetProvider = 'godot_store'

export const PROVIDER_LABELS: Record<AssetProvider, string> = {
  [GODOT_ASSET_LIBRARY_PROVIDER]: 'Legacy Asset Library',
  [GODOT_STORE_PROVIDER]: 'Godot Asset Store'
}

export const ALL_PROVIDERS: AssetProvider[] = [GODOT_ASSET_LIBRARY_PROVIDER, GODOT_STORE_PROVIDER]

/** Human label for a provider value with a safe fallback. */
export function providerLabel (provider: unknown): string {
  return provider === GODOT_STORE_PROVIDER
    ? PROVIDER_LABELS[GODOT_STORE_PROVIDER]
    : PROVIDER_LABELS[GODOT_ASSET_LIBRARY_PROVIDER]
}

export function isKnownProvider (value: unknown): value is AssetProvider {
  return value === GODOT_ASSET_LIBRARY_PROVIDER || value === GODOT_STORE_PROVIDER
}
