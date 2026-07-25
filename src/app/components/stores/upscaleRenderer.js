import {
    Original,
    ModeA,
    render,
    ModeBB,
    ModeB,
    DoG,
    BilateralMean,
    CNNM,
    CNNSoftM,
    CNNSoftVL,
    CNNVL,
    CNNUL,
    CNNx2M,
    CNNx2VL,
    DenoiseCNNx2VL,
    GANx3L,
    GANx4UUL,
    GANUUL,
    ModeAA,
    ModeCA,
    CNNx2UL,
    ModeC,
} from "anime4k-webgpu";

export const UPSCALE_MODE_MAP = {
    0: DoG,
    1: BilateralMean,
    2: CNNM,
    3: CNNSoftM,
    4: CNNSoftVL,
    5: CNNVL,
    6: CNNUL,
    7: GANUUL,
    8: CNNx2M,
    9: CNNx2VL,
    10: DenoiseCNNx2VL,
    11: CNNx2UL,
    12: GANx3L,
    13: GANx4UUL,
    14: ModeA,
    15: ModeB,
    16: ModeC,
    17: ModeAA,
    18: ModeBB,
    19: ModeCA,
};

/**
 * Рендерер апскейлинга Anime4K на базе WebGPU.
 */
export class UpscaleRenderer {
    /**
     * @param {HTMLVideoElement} video
     * @param {HTMLCanvasElement} canvas
     * @param {{ width: number, height: number }} defaultCanvasSize
     */
    constructor(video, canvas, defaultCanvasSize) {
        this.video = video;
        this.canvas = canvas;
        this.defaultCanvasSize = defaultCanvasSize || { width: screen.width, height: screen.height };
    }

    /**
     * Выполняет рендеринг кадра с апскейлингом или в оригинальном качестве
     * @param {boolean} enabled
     * @param {number} mode
     */
    async render(enabled, mode) {
        if (!this.video || !this.canvas) return;

        const ModeClass = UPSCALE_MODE_MAP[mode] || Original;

        await render({
            video: this.video,
            canvas: this.canvas,
            pipelineBuilder: (device, inputTexture) => {
                const nativeDimensions = {
                    width: this.video.videoWidth,
                    height: this.video.videoHeight,
                };

                const targetDimensions = {
                    width: this.defaultCanvasSize.width,
                    height: this.defaultCanvasSize.height,
                };

                return [
                    enabled
                        ? new ModeClass({
                              device,
                              inputTexture,
                              nativeDimensions,
                              targetDimensions,
                          })
                        : new Original({
                              device,
                              inputTexture,
                              nativeDimensions,
                              targetDimensions,
                          }),
                ];
            },
        });
    }
}

export default UpscaleRenderer;
