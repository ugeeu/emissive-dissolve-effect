import './style.css'
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { Pane } from 'tweakpane';


import { LightProbeGenerator } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/Addons.js';


const cnvs = document.getElementById('c') as HTMLCanvasElement;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(75, cnvs.clientWidth / cnvs.clientHeight, 0.001, 100);


cam.position.set(0, 0, 5);
scene.background = new THREE.Color(0x000000);


const re = new THREE.WebGLRenderer({ canvas: cnvs, antialias: true });
re.setPixelRatio(window.devicePixelRatio);
re.setSize(cnvs.clientWidth, cnvs.clientHeight, false);

const stat = new Stats();
const orbCtrls = new OrbitControls(cam, cnvs);
document.body.appendChild(stat.dom);


const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 500, cubeRenderTarget);
let lightProbe = new THREE.LightProbe();
let cubeTextureUrls: string[];
let cubeTexture: THREE.CubeTexture;


function generateCubeUrls(prefix: string, postfix: string) {
    return [
        prefix + 'posx' + postfix, prefix + 'negx' + postfix,
        prefix + 'posy' + postfix, prefix + 'negy' + postfix,
        prefix + 'posz' + postfix, prefix + 'negz' + postfix
    ];
}


cubeTextureUrls = generateCubeUrls('/cubeMap/', '.png');


async function loadTextures() {

    const cubeTextureLoader = new THREE.CubeTextureLoader();
    cubeTexture = await cubeTextureLoader.loadAsync(cubeTextureUrls);

    scene.background = cubeTexture;
    scene.environment = cubeTexture;

    cubeCamera.update(re, scene);

    lightProbe = await LightProbeGenerator.fromCubeRenderTarget(re, cubeRenderTarget);
    scene.add(lightProbe);

}


loadTextures();


let box: THREE.Object3D;
const boxGeo = new THREE.BoxGeometry();
const boxMat = new THREE.MeshPhysicalMaterial();
boxMat.metalness = 2.0;
boxMat.roughness = 0.0;
box = new THREE.Mesh(boxGeo, boxMat);
scene.add(box);

function resizeRendererToDisplaySize() {
    const width = cnvs.clientWidth;
    const height = cnvs.clientHeight;
    const needResize = cnvs.width !== width || cnvs.height !== height;
    if (needResize) {
        re.setSize(width, height, false);
    }
    return needResize;
}

let tweaks = {
    x: 0,
    z: 0,
};

const pane = new Pane();
pane.addBinding(tweaks, "x", { min: -10, max: 10, step: 0.01 }).on('change', (obj) => { box.position.x = obj.value; });
pane.addBinding(tweaks, "z", { min: -10, max: 10, step: 0.01 }).on('change', (obj) => { box.position.z = obj.value; });


function animate() {
    stat.update();
    orbCtrls.update();

    if (resizeRendererToDisplaySize()) {
        const canvas = re.domElement;
        cam.aspect = canvas.clientWidth / canvas.clientHeight;
        cam.updateProjectionMatrix();
    }



    if (box) {
        box.rotation.x += 0.01;
        box.rotation.y += 0.01;
    }



    re.render(scene, cam);
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.addEventListener('orientationchange', () => {
    location.reload();
});

