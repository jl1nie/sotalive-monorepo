import L from 'leaflet'

// 旧版は leaflet.extra-markers のスプライト(PNG 120KB + @2x 250KB)。同じ形・色の黄色いピンを、インラインの SVG で描く
const USER =
  '<path fill="#fff" transform="translate(10.5 10.5) scale(.0273)" d="M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z"/>'
const PIN =
  `<svg xmlns="http://www.w3.org/2000/svg" width="35" height="46" viewBox="0 0 35 46">` +
  `<path d="M17.5 1C8.4 1 1 8.3 1 17.3 1 28 17.5 45 17.5 45S34 28 34 17.3C34 8.3 26.6 1 17.5 1z" fill="#f5bb30" stroke="#c98a12" stroke-width="1.2"/>` +
  `<circle cx="17.5" cy="17.5" r="11" fill="#e8a416"/>${USER}</svg>`

/** 現在地のマーカーの見た目(旧版: 黄色の丸いピンに、人のアイコン) */
export function qthIcon(): L.DivIcon {
  return L.divIcon({
    className: 'qth-marker',
    html: PIN,
    iconSize: [35, 46],
    iconAnchor: [17, 42],
    popupAnchor: [1, -32],
  })
}
