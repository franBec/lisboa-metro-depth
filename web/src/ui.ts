import type { DepthSource, Line, Manifest, Station } from './types'

export interface UIActions {
  onLineToggle: (lineId: string) => void
  onLabelsToggle: (visible: boolean) => void
  onXRayToggle: (enabled: boolean) => void
  onInferredToggle: (visible: boolean) => void
  onScaleChange: (scale: number) => void
  onCloseStation: () => void
}

const SOURCE_LABELS: Record<DepthSource, string> = {
  measured: 'Measured',
  official: 'Official',
  estimated: 'Estimated',
  unknown: 'Unknown',
}

const SOURCE_ORDER: DepthSource[] = ['measured', 'official', 'estimated', 'unknown']

export class ViewerUI {
  private readonly manifest: Manifest
  private readonly lines: Line[]
  private readonly actions: UIActions
  private readonly linePicker: HTMLElement
  private readonly legendItems: HTMLElement
  private readonly stationPanel: HTMLElement
  private readonly stationContent: HTMLElement
  private readonly scaleValue: HTMLElement
  private readonly scaleButtons: HTMLElement
  private readonly demoBadge: HTMLElement

  constructor(manifest: Manifest, lines: Line[], actions: UIActions) {
    this.manifest = manifest
    this.lines = lines
    this.actions = actions
    this.linePicker = mustGet('line-picker')
    this.legendItems = mustGet('legend-items')
    this.stationPanel = mustGet('station-panel')
    this.stationContent = mustGet('station-content')
    this.scaleValue = mustGet('scale-value')
    this.scaleButtons = mustGet('scale-buttons')
    this.demoBadge = mustGet('demo-badge')

    this.renderLinePicker()
    this.renderLegend()
    this.renderDemo()
    this.renderAttribution()
    this.wireControls()
  }

  private renderLinePicker(): void {
    this.linePicker.replaceChildren()
    for (const line of this.lines) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'line-button'
      button.dataset.line = line.id
      button.addEventListener('click', () => this.actions.onLineToggle(line.id))

      const swatch = document.createElement('span')
      swatch.className = 'line-swatch'
      swatch.style.background = line.color

      const name = document.createElement('span')
      name.className = 'line-name'
      name.textContent = line.name

      const count = document.createElement('span')
      count.className = 'line-count'
      count.textContent = `${line.segments.length} seg`

      button.append(swatch, name, count)
      this.linePicker.append(button)
    }
  }

  private renderLegend(): void {
    this.legendItems.replaceChildren()
    const platformCounts = this.manifest.provenance_counts.platforms
    const segmentCounts = this.manifest.provenance_counts.segments
    for (const source of SOURCE_ORDER) {
      const row = document.createElement('div')
      row.className = 'legend-row'

      const line = document.createElement('span')
      line.className = 'legend-line'
      if (source === 'estimated') line.classList.add('dashed')
      if (source === 'unknown') line.classList.add('dotted')
      line.style.setProperty(
        '--c',
        source === 'measured'
          ? '#d9d4c6'
          : source === 'official'
            ? '#9fa39a'
            : source === 'estimated'
              ? '#7f8c86'
              : '#6d6e68',
      )

      const label = document.createElement('span')
      label.textContent = SOURCE_LABELS[source]

      const count = document.createElement('em')
      const platforms = platformCounts[source] ?? 0
      const segments = segmentCounts[source] ?? 0
      count.textContent = `${platforms} st · ${segments} seg`

      row.append(line, label, count)
      this.legendItems.append(row)
    }
    mustGet('dataset-version').textContent = this.manifest.dataset_version
    mustGet('demo-note').textContent = this.manifest.demo_note
  }

  private renderDemo(): void {
    this.demoBadge.hidden = !this.manifest.demo
    mustGet('demo-text').textContent = this.manifest.capabilities.measured_depths
      ? 'Demo terrain · measured overlay'
      : 'Demo terrain · official depths'
  }

  private renderAttribution(): void {
    const names = this.manifest.attribution.map((entry) => entry.name)
    mustGet('attribution').textContent = names.join(' / ')
  }

  private wireControls(): void {
    mustGet<HTMLInputElement>('labels-toggle').addEventListener('change', (event) => {
      this.actions.onLabelsToggle((event.target as HTMLInputElement).checked)
    })
    mustGet<HTMLInputElement>('xray-toggle').addEventListener('change', (event) => {
      this.actions.onXRayToggle((event.target as HTMLInputElement).checked)
    })
    mustGet<HTMLInputElement>('inferred-toggle').addEventListener('change', (event) => {
      this.actions.onInferredToggle((event.target as HTMLInputElement).checked)
    })
    this.scaleButtons.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      if (target.tagName !== 'BUTTON') return
      const scale = Number((target as HTMLButtonElement).dataset.scale)
      if (Number.isFinite(scale)) {
        this.actions.onScaleChange(scale)
      }
    })
    mustGet('station-close').addEventListener('click', () => this.actions.onCloseStation())
  }

  setSelectedLines(selected: Set<string>): void {
    for (const button of this.linePicker.querySelectorAll<HTMLButtonElement>('.line-button')) {
      const lineId = button.dataset.line ?? ''
      const active = selected.size === 0 || selected.has(lineId)
      button.classList.toggle('selected', selected.has(lineId))
      button.classList.toggle('dimmed', !active)
    }
  }

  setXRay(checked: boolean): void {
    mustGet<HTMLInputElement>('xray-toggle').checked = checked
  }

  setScale(scale: number): void {
    this.scaleValue.textContent = `x${scale}`
    for (const button of this.scaleButtons.querySelectorAll<HTMLButtonElement>('button')) {
      button.classList.toggle('active', Number(button.dataset.scale) === scale)
    }
  }

  showStation(station: Station, lineColors: Map<string, string>): void {
    this.stationContent.replaceChildren()

    const kicker = document.createElement('p')
    kicker.className = 'station-kicker'
    kicker.textContent = station.platforms.length > 1 ? 'Interchange' : 'Station'

    const title = document.createElement('h2')
    title.className = 'station-title'
    title.textContent = station.name

    const sub = document.createElement('p')
    sub.className = 'station-sub'
    const lineNames = station.lines
      .map((lineId) => this.lines.find((line) => line.id === lineId)?.name ?? lineId)
      .join(' · ')
    sub.textContent = `${lineNames} — surface ${station.surface_elevation_m.toFixed(1)} m`

    const list = document.createElement('div')
    list.className = 'platform-list'

    for (const platform of station.platforms) {
      const row = document.createElement('div')
      row.className = 'platform-row'

      const head = document.createElement('div')
      head.className = 'platform-head'
      const swatch = document.createElement('span')
      swatch.className = 'platform-swatch'
      swatch.style.background = lineColors.get(platform.line) ?? '#999'
      const lineName = document.createElement('span')
      lineName.textContent = this.lines.find((line) => line.id === platform.line)?.name ?? platform.line
      const source = document.createElement('span')
      source.className = 'platform-source'
      source.textContent = SOURCE_LABELS[platform.depth_source]
      head.append(swatch, lineName, source)

      const grid = document.createElement('div')
      grid.className = 'platform-grid'
      addGridRow(grid, 'Depth', platform.platform_depth_m === null ? 'Unknown' : `${platform.platform_depth_m.toFixed(2)} m`)
      addGridRow(grid, 'Basis', platform.depth_basis)
      if (platform.confidence_m !== null) {
        addGridRow(grid, 'Confidence', `±${platform.confidence_m.toFixed(1)} m`)
      }
      if (platform.official_depth_m !== null && platform.depth_source !== 'official') {
        addGridRow(grid, 'Official', `${platform.official_depth_m.toFixed(2)} m`)
      }
      if (platform.measured_depth_m !== null) {
        addGridRow(grid, 'Measured', `${platform.measured_depth_m.toFixed(2)} m`)
      }

      row.append(head, grid)
      if (platform.note) {
        const note = document.createElement('p')
        note.className = 'platform-note'
        note.textContent = platform.note
        row.append(note)
      }
      list.append(row)
    }

    const crossing = this.crossingSummary(station)
    this.stationContent.append(kicker, title, sub, list)
    if (crossing) this.stationContent.append(crossing)
    this.stationPanel.hidden = false
  }

  private crossingSummary(station: Station): HTMLElement | null {
    if (station.platforms.length < 2) return null

    const box = document.createElement('div')
    box.className = 'crossing-box'
    const heading = document.createElement('h3')
    const body = document.createElement('p')
    box.append(heading, body)

    const known = station.platforms.filter((platform) => platform.platform_depth_m !== null)
    const unknown = station.platforms.filter((platform) => platform.platform_depth_m === null)

    if (unknown.length > 0) {
      box.classList.add('warning')
      heading.textContent = 'Crossing unresolved'
      const names = unknown.map((platform) => platform.line).join(', ')
      const label = unknown.length === 1 ? `Platform ${names} has` : `Platforms ${names} have`
      body.textContent = `${label} no depth yet. The viewer will not draw a guessed crossing.`
      return box
    }

    if (known.length < 2) return null

    const deepest = known.reduce((best, platform) =>
      (platform.platform_depth_m ?? 0) > (best.platform_depth_m ?? 0) ? platform : best,
    )
    const shallowest = known.reduce((best, platform) =>
      (platform.platform_depth_m ?? 0) < (best.platform_depth_m ?? 0) ? platform : best,
    )
    const gap = (deepest.platform_depth_m ?? 0) - (shallowest.platform_depth_m ?? 0)
    const basis = known.every((platform) => platform.depth_basis === 'station')

    heading.textContent = 'Crossing check'
    if (gap < 0.05) {
      box.classList.add('warning')
      body.textContent = basis
        ? 'Both lines use the same station-level depth. Platform separation is unknown, not zero.'
        : 'Platform depths are equal. Check the survey if the lines should be separated.'
    } else {
      body.textContent = `Line ${deepest.line} is ${gap.toFixed(2)} m below line ${shallowest.line} at this station.`
    }
    return box
  }

  setStationVisible(visible: boolean): void {
    this.stationPanel.hidden = !visible
  }

  hideLoading(): void {
    mustGet('loading').hidden = true
  }

  showError(message: string): void {
    mustGet('loading').hidden = true
    const overlay = mustGet('error')
    overlay.hidden = false
    mustGet('error-text').textContent = message
  }
}

function mustGet<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`missing element #${id}`)
  return element as T
}

function addGridRow(parent: HTMLElement, label: string, value: string): void {
  const key = document.createElement('span')
  key.textContent = label
  const val = document.createElement('strong')
  val.textContent = value
  parent.append(key, val)
}
