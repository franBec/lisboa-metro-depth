import type { ComponentType } from 'react'
import {
  Aeroporto,
  ArcoRuaAugusta,
  CasteloDeSaoJorge,
  ElevadorDeSantaJusta,
  EstacaoDoRossio,
  EstadioDaLuz,
  EstadioJoseAlvalade,
  GareDoOriente,
  MercadoDaRibeira,
  MuseuGulbenkian,
  PanteaoNacional,
  PavilhaoDePortugal,
  PracaDeTourosCampoPequeno,
  PracaDoComercio,
  SeDeLisboa,
} from './LandmarkModels'

/**
 * Procedural low-poly stand-ins for the curated map landmarks, keyed by the
 * `id` column of pipeline/curated/landmarks.csv. Park rows have no model and
 * keep their flat labels.
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
  'museu-gulbenkian': 10,
  'estadio-da-luz': 46,
  'estadio-jose-alvalade': 40,
  'aeroporto-terminal': 194,
  'elevador-santa-justa': 72,
  'arco-rua-augusta': 50,
  'panteao-nacional': 56,
  'estacao-rossio': 42,
  'mercado-da-ribeira': 30,
  'praca-de-touros-campo-pequeno': 32,
  'gare-do-oriente': 48,
  'pavilhao-de-portugal': 26,
}

const REGISTRY: Record<string, ComponentType> = {
  'castelo-sao-jorge': CasteloDeSaoJorge,
  'se-de-lisboa': SeDeLisboa,
  'praca-do-comercio': PracaDoComercio,
  'museu-gulbenkian': MuseuGulbenkian,
  'estadio-da-luz': EstadioDaLuz,
  'estadio-jose-alvalade': EstadioJoseAlvalade,
  'aeroporto-terminal': Aeroporto,
  'elevador-santa-justa': ElevadorDeSantaJusta,
  'arco-rua-augusta': ArcoRuaAugusta,
  'panteao-nacional': PanteaoNacional,
  'estacao-rossio': EstacaoDoRossio,
  'mercado-da-ribeira': MercadoDaRibeira,
  'praca-de-touros-campo-pequeno': PracaDeTourosCampoPequeno,
  'gare-do-oriente': GareDoOriente,
  'pavilhao-de-portugal': PavilhaoDePortugal,
}

export function hasLandmarkModel(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRY, id)
}

export function getLandmarkModel(id: string): ComponentType | null {
  return REGISTRY[id] ?? null
}
