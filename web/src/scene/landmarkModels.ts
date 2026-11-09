import type { ComponentType } from 'react'
import {
  Aeroporto,
  AquedutoAguasLivres,
  CasteloDeSaoJorge,
  EstadioDaLuz,
  EstadioJoseAlvalade,
  MuseuGulbenkian,
  Oceanario,
  PracaDoComercio,
  SeDeLisboa,
  TorreVascoDaGama,
} from './LandmarkModels'

/**
 * Procedural low-poly stand-ins for the curated map landmarks, keyed by the
 * `id` column of pipeline/curated/landmarks.csv. Park and water rows have no
 * model and keep their flat labels.
 *
 * Heights are silhouette tops in world units on the same vertical axis as
 * the terrain (which is vertically exaggerated; viewport default 10x). They
 * feed the DOM label lift in landmarkVisuals.ts and must stay in sync with
 * the tallest part of each shape in LandmarkModels.tsx.
 */

/** Model silhouette top in world units, for label clearance. */
export const LANDMARK_MODEL_TOPS: Record<string, number> = {
  'castelo-sao-jorge': 52,
  'se-de-lisboa': 60,
  'praca-do-comercio': 44,
  'aqueduto-aguas-livres': 47,
  'estadio-da-luz': 46,
  'estadio-jose-alvalade': 40,
  'museu-gulbenkian': 10,
  'torre-vasco-da-gama': 221,
  oceanario: 42,
  'aeroporto-terminal': 194,
}

const REGISTRY: Record<string, ComponentType> = {
  'castelo-sao-jorge': CasteloDeSaoJorge,
  'se-de-lisboa': SeDeLisboa,
  'praca-do-comercio': PracaDoComercio,
  'aqueduto-aguas-livres': AquedutoAguasLivres,
  'estadio-da-luz': EstadioDaLuz,
  'estadio-jose-alvalade': EstadioJoseAlvalade,
  'museu-gulbenkian': MuseuGulbenkian,
  'torre-vasco-da-gama': TorreVascoDaGama,
  oceanario: Oceanario,
  'aeroporto-terminal': Aeroporto,
}

export function hasLandmarkModel(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRY, id)
}

export function getLandmarkModel(id: string): ComponentType | null {
  return REGISTRY[id] ?? null
}
