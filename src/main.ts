import { Fauxel } from './lib/fauxel'
import drawShader from './draw.frag'
import './style.css'

const canvasElement = document.getElementById('canvas') as HTMLCanvasElement

new Fauxel({
    canvasElement,
    drawShader,

    onInit () {
    },

    onUpdate () {
    },
})
