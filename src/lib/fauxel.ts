import * as twgl from 'twgl.js'
import fragmentShader from './shaders/frag.frag'
import vertexShader from './shaders/vert.vert'



// #region Constants

const QUAD_VERTICES = [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0]

// #endregion



// #region Data Structures

export const enum CursorAction {
    LEFT_CLICK = 'mouse_button_1',
    MIDDLE_CLICK = 'mouse_button_2',
    RIGHT_CLICK = 'mouse_button_3',
    BUTTON_4_CLICK = 'mouse_button_4',
    BUTTON_5_CLICK = 'mouse_button_5',
    TOUCH = 'touch',
}

type UniformValue = number | number[] | number[][] | WebGLTexture

interface UniformBlock {
    index: number
    bytesPerElement: number
    data: {
        byteOffset: number
        name: string
        values: number[] | Float32Array
    }[]
}

type ResourceValue = Response | ImageData | AudioBuffer | string

interface Sampler {
    texture: WebGLTexture
    framebufferInfo: twgl.FramebufferInfo
    imageData: ImageData
}

interface FauxelOptions {
    canvasElement: HTMLCanvasElement
    drawShader: string
    onInit?: (this: Fauxel, options: FauxelOptions) => Promise<void>
    onUpdate: (this: Fauxel, tickNumber: number) => void
    pointsPerPixel?: number
    pointsPerSprite?: number
    updatesPerSecond?: number
}

// #endregion



export class Fauxel {



    // #region Fields



    // Update Loop Fields

    tickNumber = 0
    private onUpdate: (tickNumber: number) => void = () => {}
    private created: number = performance.now()
    private lastNow: number = performance.now()
    private tickAccumulator: number = 0
    private tickListener: FrameRequestCallback = this.doTick.bind(this)
    private updatesPerSecond: number = 60

    // Device Management Fields

    deviceHasTouchscreen: boolean = this.getDeviceHasTouchscreen()
    deviceOrientation: 'landscape' | 'portrait' = this.getDeviceOrientation()
    private resizeDebounce: number = 0

    // Canvas and Graphics Fields

    canvas: HTMLCanvasElement
    private trueCanvasSize = { x: 0, y: 0 } // canvas brect size in pixels
    private pointsPerPixel = 5
    private pointsPerSprite = 16
    private gl: WebGL2RenderingContext
    private programInfo: twgl.ProgramInfo
    private bufferInfo: twgl.BufferInfo
    private uniforms: Record<string, UniformValue> = {}
    private uniformBlocks: Record<string, UniformBlock> = {}
    private spriteTexture: Sampler = { texture: null!, framebufferInfo: null!, imageData: null! }

    // Keyboard Input Fields

    private keysPressedThisFrame: { [key: string]: boolean } = {}
    private keysHeld: { [key: string]: boolean } = {}
    private keysPressed: { [key: string]: boolean } = {}

    // Mouse and Touch Input Fields

    cursorPosition = { x: 0, y: 0 }
    private cursorHeld: CursorAction | boolean = false
    private cursorPressed: CursorAction | boolean = false
    private cursorPressedThisFrame = false

    // Resource Management Fields

    private resourceCache: Record<string, ResourceValue> = {}

    // #endregion



    // #region Constructor 

    constructor (options: FauxelOptions) {
        this.updatesPerSecond = options.updatesPerSecond || this.updatesPerSecond
        this.onUpdate = options.onUpdate

        this.canvas = options.canvasElement
        this.pointsPerPixel = options.pointsPerPixel || this.pointsPerPixel
        this.pointsPerSprite = options.pointsPerSprite || this.pointsPerSprite
        this.gl = options.canvasElement.getContext('webgl2')!
        const drawShader = fragmentShader.replace('#pragma onDraw', options.drawShader)
        this.programInfo = twgl.createProgramInfo(this.gl, [vertexShader, drawShader])
        this.bufferInfo = twgl.createBufferInfoFromArrays(this.gl, { position: QUAD_VERTICES })

        this.calculateSize()
        this.applyClasses()
        this.recreateSamplers()

        window.addEventListener('resize', () => {
            clearTimeout(this.resizeDebounce!)

            this.deviceHasTouchscreen = this.getDeviceHasTouchscreen()
            this.deviceOrientation = this.getDeviceOrientation()

            this.resizeDebounce = setTimeout(() => {
                this.calculateSize()
                this.applyClasses()
                this.recreateSamplers()
            }, 300)
        })

        window.addEventListener('deviceorientation', () => {
            this.deviceHasTouchscreen = this.getDeviceHasTouchscreen()
            this.deviceOrientation = this.getDeviceOrientation()

            this.applyClasses()
        }, true)

        document.body.addEventListener('keydown', this.onKeydown.bind(this))
        document.body.addEventListener('keyup', this.onKeyup.bind(this))

        this.canvas.addEventListener('mousemove', this.onCursorMove.bind(this))
        this.canvas.addEventListener('mousedown', this.onCursorDown.bind(this))
        this.canvas.addEventListener('mouseup', this.onCursorUp.bind(this))
        this.canvas.addEventListener('click', (evt: MouseEvent) => evt.preventDefault())
        this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this))

        if (this.deviceHasTouchscreen) {
            this.canvas.addEventListener('touchmove', this.onCursorMove.bind(this))
            this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this))
            this.canvas.addEventListener('touchend', this.onCursorUp.bind(this))
        }

        if (options.onInit) {
            options.onInit
                .call(this, options)
                .then(() => this.doTick())
        } else {
            this.doTick()
        }
    }

    // #endregion



    // #region Game Loops

    private doTick () {
        requestAnimationFrame(this.tickListener)
        this.doInputTick()
        this.doUpdateTick()
        this.doDrawTick()
    }

    private doInputTick () {
        for (const key in this.keysPressed) {
            if (this.keysPressedThisFrame[key]) {
                delete this.keysPressedThisFrame[key]
            } else {
                delete this.keysPressed[key]
            }
        }

        if (!this.cursorPressedThisFrame) this.cursorPressed = false
        this.cursorPressedThisFrame = false
    }

    private doUpdateTick () {
        const now = performance.now() - this.created
        const delta = now - this.lastNow
        this.tickAccumulator += delta
        this.lastNow = now

        const tickInterval = 1000 / this.updatesPerSecond

        while (this.tickAccumulator > tickInterval) {
            this.tickAccumulator -= tickInterval
            this.onUpdate.call(this, this.tickNumber)
            this.tickNumber = (this.tickNumber + 1) % Number.MAX_SAFE_INTEGER
        }
    }

    private doDrawTick () {
        // Setup
        this.gl.enable(this.gl.CULL_FACE)
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null!)
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT)
        this.gl.useProgram(this.programInfo.program)

        // Apply image data to texture samplers
        const spriteTexture = this.spriteTexture.framebufferInfo.attachments.find((att: any) => att instanceof WebGLTexture)!
        twgl.setTextureFromArray(
            this.gl,
            spriteTexture,
            this.spriteTexture.imageData.data,
            {
                width: this.spriteTexture.imageData.width,
                height: this.spriteTexture.imageData.height,
                flipY: 1,
            }
        )

        // Set uniforms
        const uniforms = {
            ...this.uniforms,
            u_tickNumber: this.tickNumber,
            u_canvasSize: [this.canvas.width, this.canvas.height],
            u_cursorPosition: [this.cursorPosition.x, this.cursorPosition.y],
            u_pointsPerSprite: this.pointsPerSprite,
            u_spriteTexture: spriteTexture,
            u_spriteTextureSize: [this.spriteTexture.imageData.width, this.spriteTexture.imageData.height],
        }
        twgl.setUniforms(this.programInfo, uniforms)

        // Set uniform blocks
        for (const name in this.uniformBlocks) {
            const block = this.uniformBlocks[name]
            block.data.forEach((data) => {
                this.gl.bufferSubData(this.gl.UNIFORM_BUFFER, block.index, data.values as Float32Array);
            })
        }
        
        // Render the scene
        twgl.setBuffersAndAttributes(this.gl, this.programInfo, this.bufferInfo)
        twgl.drawBufferInfo(this.gl, this.bufferInfo)
    }

    // #endregion



    // #region Device and Window Management Methods

    private getDeviceHasTouchscreen () {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
    }

    private getDeviceOrientation () {
        return window.matchMedia('(orientation: landscape)').matches
          ? 'landscape'
          : 'portrait'
    }

    private applyClasses () {
        const viewportAspectRatio = window.innerHeight / window.innerWidth
        const canvasAspectRatio = this.canvas.height / this.canvas.width

        const el = this.canvas
        el?.classList.remove('--wide')
        el?.classList.remove('--tall')

        if (viewportAspectRatio > canvasAspectRatio) {
            el?.classList.add('--wide')
        } else {
            el?.classList.add('--tall')
        }
    }

    private calculateSize () {
        const nearestPowerOfTwo = (value: number) => {
            // return 1 << 31 - Math.clz32(value)
            return value
        }
        this.canvas.width = nearestPowerOfTwo(Math.floor(window.innerWidth / this.pointsPerPixel))
        this.canvas.height = nearestPowerOfTwo(Math.floor(window.innerHeight / this.pointsPerPixel))

        const rect = this.canvas.getBoundingClientRect()
        this.trueCanvasSize.x = rect.width
        this.trueCanvasSize.y = rect.height
    }

    // #endregion



    // #region Graphics Methods

    private recreateSamplers () {
        this.spriteTexture = this.createSampler(this.spriteTexture.imageData)
    }

    private createSampler (imageData?: ImageData, wrap?: boolean): Sampler {
        const attachments = [
            { format: this.gl.RGBA, type: this.gl.UNSIGNED_BYTE, min: this.gl.NEAREST, mag: this.gl.NEAREST, wrap: this.gl.CLAMP_TO_EDGE, },
            { format: this.gl.DEPTH_STENCIL, },
        ]
        const framebufferInfo = twgl.createFramebufferInfo(this.gl, attachments)
        twgl.bindFramebufferInfo(this.gl, framebufferInfo)

        if (!imageData) {
            const buffer = document.createElement('canvas')
            buffer.width = 16
            buffer.height = 16
            const context = buffer.getContext('2d')!
            context.fillStyle = '#211C55'
            context.fillRect(0, 0, 16, 16)
            imageData = context.getImageData(0, 0, 16, 16)
        }

        const texture = twgl.createTexture(this.gl, {
            min: this.gl.NEAREST,
            mag: this.gl.NEAREST,
            wrap: wrap ? this.gl.REPEAT : this.gl.CLAMP_TO_EDGE,
            src: imageData,
        })

        return {
            texture,
            framebufferInfo,
            imageData,
        }
    }

    setUniform (name: string, value: UniformValue) {
        this.uniforms[name] = value
    }

    setSpriteTexture (imageData: ImageData) {
        this.spriteTexture.imageData = imageData
        this.recreateSamplers()
    }

    // #endregion



    // #region Keyboard Input Methods

    keyPressed (which: string) {
        return !!this.keysPressed[which.toLowerCase()]
    }

    keyHeld (which: string) {
        return !!this.keysHeld[which.toLowerCase()]
    }

    private onKeydown (evt: KeyboardEvent) {
        const key = evt.key.toLowerCase()

        if (this.keysHeld[key]) return

        this.keysHeld[key] = true
        this.keysPressed[key] = true
        this.keysPressedThisFrame[key] = true
    }

    private onKeyup (evt: KeyboardEvent) {
        const key = evt.key.toLowerCase()

        delete this.keysHeld[key]
    }

    // #endregion



    // #region Mouse and Touch Input Methods

    buttonPressed (which: CursorAction) {
        return this.cursorPressed === which
    }

    buttonHeld (which: CursorAction) {
        return this.cursorHeld === which
    }

    private onCursorMove (evt: any | MouseEvent) {
        evt.preventDefault()

        const w = (window.innerWidth - this.trueCanvasSize.x) / 2
        const h = (window.innerHeight - this.trueCanvasSize.y) / 2

        let mx, my
        if (this.deviceHasTouchscreen) {
            evt = evt as TouchEvent
            mx = evt.touches[0].clientX - w
            my = evt.touches[0].clientY - h
        } else {
            mx = evt.clientX - w
            my = evt.clientY - h
        }

        this.cursorPosition.x = Math.round(mx / this.pointsPerPixel)
        this.cursorPosition.y = Math.round(my / this.pointsPerPixel)
    }

    private onCursorDown (evt: MouseEvent) {
        evt.preventDefault()

        const button = ('mouse_button_' + (evt.button + 1)) as CursorAction

        this.cursorHeld = button
        this.cursorPressed = button
        this.cursorPressedThisFrame = true
    }

    private onCursorUp (evt: any | MouseEvent) {
        evt.preventDefault()

        this.cursorHeld = false
    }

    private onTouchStart (evt: any) {
        evt.preventDefault()

        this.onCursorMove(evt)

        this.cursorHeld = CursorAction.TOUCH
        this.cursorPressed = CursorAction.TOUCH
        this.cursorPressedThisFrame = true
    }

    private onContextMenu (evt: MouseEvent) {
        evt.preventDefault()
    }

    // #endregion



    // #region Resource Management Methods

    async loadResource (url: string): Promise<Response> {
        if (this.resourceCache[url]) return this.resourceCache[url] as Response

        const res = await fetch(url)
        this.resourceCache[url] = res

        return res
    }

    async loadTextResource (url: string): Promise<string> {
        if (this.resourceCache[url]) return this.resourceCache[url] as string

        const res = await fetch(url)
        const text = await res.text()
        this.resourceCache[url] = text

        return text
    }

    async loadAudioResource (url: string): Promise<AudioBuffer> {
        if (this.resourceCache[url]) return this.resourceCache[url] as AudioBuffer

        const res = await fetch(url)
        const buffer = await res.arrayBuffer()

        const audioContext = new AudioContext()
        const audioBuffer = await audioContext.decodeAudioData(buffer)
        this.resourceCache[url] = audioBuffer

        return audioBuffer
    }

    async loadSpriteResource (url: string): Promise<ImageData> {
        if (this.resourceCache[url]) return this.resourceCache[url] as ImageData

        const res = await fetch(url)
        const blob = await res.blob()
        const bitmap = await createImageBitmap(blob)

        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')!
        context.drawImage(bitmap, 0, 0)

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        this.resourceCache[url] = imageData

        return imageData
    }

    // #endregion



}
