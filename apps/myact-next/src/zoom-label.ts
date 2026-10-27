import L from 'leaflet'

/** 左下に、今のズームの数字を出す */
export class ZoomLabel extends L.Control {
  private el?: HTMLElement

  constructor() {
    super({ position: 'bottomleft' })
  }

  onAdd(map: L.Map): HTMLElement {
    const el = L.DomUtil.create('div', 'leaflet-control-zoomlabel')
    L.DomEvent.disableClickPropagation(el)
    el.textContent = String(map.getZoom())
    map.on('zoomend', this.update, this)
    this.el = el
    return el
  }

  onRemove(map: L.Map): void {
    map.off('zoomend', this.update, this)
  }

  private update = (e: L.LeafletEvent) => {
    if (this.el) this.el.textContent = String((e.target as L.Map).getZoom())
  }
}
