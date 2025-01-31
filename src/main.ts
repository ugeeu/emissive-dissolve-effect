import './style.css'
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { Pane } from 'tweakpane';


import { LightProbeGenerator } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/Addons.js';


import cnoise from './lib/noise/cnoise.glsl?raw';


const cnvs = document.getElementById('c') as HTMLCanvasElement;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(75, cnvs.clientWidth / cnvs.clientHeight, 0.001, 100);


cam.position.set(0, 0, 10);
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


let mesh: THREE.Object3D;
let meshGeo: THREE.BufferGeometry;

meshGeo = new THREE.SphereGeometry(4, 182, 182);
const phyMat = new THREE.MeshPhysicalMaterial();
phyMat.color = new THREE.Color(0x001100);
phyMat.metalness = 0.8;
phyMat.roughness = 0.0;
phyMat.side = THREE.DoubleSide;


const dissolveUniformData = {
    uEdgeColor: {
        value: new THREE.Color(),
    },
    uFreq: {
        value: 0.45,
    },
    uAmp: {
        value: 16.0
    },
    uProgress: {
        value: -7.0
    },
    uEdge: {
        value: 0.8
    }
}


function setupUniforms(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: { [uniform: string]: THREE.IUniform<any> }) {
    const keys = Object.keys(uniforms);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        shader.uniforms[key] = uniforms[key];
    }
}

function setupDissolveShader(shader: THREE.WebGLProgramParametersWithUniforms) {
    // vertex shader snippet outside main
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        varying vec3 vPos;
    `);

    // vertex shader snippet inside main
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vPos = position;
    `);

    // fragment shader snippet outside main
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vPos;

        uniform float uFreq;
        uniform float uAmp;
        uniform float uProgress;
        uniform float uEdge;
        uniform vec3 uEdgeColor;

        ${cnoise}
    `);

    // fragment shader snippet inside main
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>

        float noise = cnoise(vPos * uFreq) * uAmp; // calculate cnoise in fragment shader for smooth dissolve edges

        if(noise < uProgress) discard; // discard any fragment where noise is lower than progress

        float edgeWidth = uProgress + uEdge;

        if(noise > uProgress && noise < edgeWidth){
            gl_FragColor = vec4(vec3(uEdgeColor),noise); // colors the edge
        }

        gl_FragColor = vec4(gl_FragColor.xyz,1.0);
    `);

}


phyMat.onBeforeCompile = (shader) => {
    setupUniforms(shader, dissolveUniformData);
    setupDissolveShader(shader);
}


mesh = new THREE.Mesh(meshGeo, phyMat);
scene.add(mesh);


let particleMesh: THREE.Points;
let particleMat = new THREE.ShaderMaterial();

let particleCount = meshGeo.attributes.position.count;
let particleMaxOffsetArr: Float32Array; // -- how far a particle can go from its initial position 
let particleInitPosArr: Float32Array; // store the initial position of the particles -- particle position will reset here if it exceed maxoffset
let particleCurrPosArr: Float32Array; // use to update he position of the particle 
let particleVelocityArr: Float32Array; // velocity of each particle

let particleSpeedFactor = 0.02; // for tweaking velocity 

function initParticleAttributes() {
    particleMaxOffsetArr = new Float32Array(particleCount);
    particleInitPosArr = new Float32Array(meshGeo.getAttribute('position').array);
    particleCurrPosArr = new Float32Array(meshGeo.getAttribute('position').array);
    particleVelocityArr = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        let x = i * 3 + 0;
        let y = i * 3 + 1;
        let z = i * 3 + 2;

        particleMaxOffsetArr[i] = Math.random() * 1.5 + 0.2;

        particleVelocityArr[x] = 0;
        particleVelocityArr[y] = Math.random() + 0.01;
        particleVelocityArr[z] = 0;
    }

    meshGeo.setAttribute('aOffset', new THREE.BufferAttribute(particleMaxOffsetArr, 1));
    meshGeo.setAttribute('aCurrentPos', new THREE.BufferAttribute(particleCurrPosArr, 3));
    meshGeo.setAttribute('aVelocity', new THREE.BufferAttribute(particleVelocityArr, 3));
}

function updateParticleAttriutes() {
    for (let i = 0; i < particleCount; i++) {
        let x = i * 3 + 0;
        let y = i * 3 + 1;
        let z = i * 3 + 2;

        particleCurrPosArr[x] += particleVelocityArr[x] * particleSpeedFactor;
        particleCurrPosArr[y] += particleVelocityArr[y] * particleSpeedFactor;
        particleCurrPosArr[z] += particleVelocityArr[z] * particleSpeedFactor;

        const vec1 = new THREE.Vector3(particleInitPosArr[x], particleInitPosArr[y], particleInitPosArr[z]);
        const vec2 = new THREE.Vector3(particleCurrPosArr[x], particleCurrPosArr[y], particleCurrPosArr[z]);
        const dist = vec1.distanceTo(vec2);

        if (dist > particleMaxOffsetArr[i]) {
            particleCurrPosArr[x] = particleInitPosArr[x];
            particleCurrPosArr[y] = particleInitPosArr[y];
            particleCurrPosArr[z] = particleInitPosArr[z];
        }

    }

    meshGeo.setAttribute('aOffset', new THREE.BufferAttribute(particleMaxOffsetArr, 1));
    meshGeo.setAttribute('aCurrentPos', new THREE.BufferAttribute(particleCurrPosArr, 3));
    meshGeo.setAttribute('aVelocity', new THREE.BufferAttribute(particleVelocityArr, 3));
}

initParticleAttributes();


const particlesUniformData = {
    uPixelDensity: {
        value: re.getPixelRatio()
    },
    uProgress: dissolveUniformData.uProgress,
    uEdge: dissolveUniformData.uEdge,
    uAmp: dissolveUniformData.uAmp,
    uFreq: dissolveUniformData.uFreq,
    uBaseSize: {
        value: 42.0,
    },
    uColor: {
        value: new THREE.Color(0xd1d1d1),
    }
}

particleMat.uniforms = particlesUniformData;

particleMat.vertexShader = `

${cnoise}

uniform float uPixelDensity;
uniform float uBaseSize;
uniform float uFreq;
uniform float uAmp;
uniform float uEdge;
uniform float uProgress;

varying float vNoise;

attribute vec3 aCurrentPos;

void main() {
    vec3 pos = position;

    float noise = cnoise(pos * uFreq) * uAmp;
    vNoise =noise;

    if( vNoise > uProgress && vNoise < uProgress + uEdge){
        pos = aCurrentPos;
    }

    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    gl_PointSize = (uBaseSize * uPixelDensity) / -viewPosition.z;
}
`;

particleMat.fragmentShader = `
uniform vec3 uColor;
uniform float uEdge;
uniform float uProgress;

varying float vNoise;

void main(){
    if( vNoise < uProgress ) discard;
    if( vNoise > uProgress + uEdge) discard;

    gl_FragColor = vec4(uColor,1.0);
}
`;


particleMesh = new THREE.Points(meshGeo, particleMat);
scene.add(particleMesh);


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

    dissolveProgress: dissolveUniformData.uProgress.value,
    edgeWidth: dissolveUniformData.uEdge.value,
    amplitude: dissolveUniformData.uAmp.value,
    frequency: dissolveUniformData.uFreq.value,
    meshVisible: true,
    meshColor: "#" + phyMat.color.getHexString(),
    edgeColor: "#" + dissolveUniformData.uEdgeColor.value.getHexString(),

    particleVisible: true,
    particleBaseSize: particlesUniformData.uBaseSize.value,
    particleColor: "#" + particlesUniformData.uColor.value.getHexString(),
    particleSpeedFactor: particleSpeedFactor,
};


const pane = new Pane();
pane.addBinding(tweaks, "x", { min: -10, max: 10, step: 0.01 }).on('change', (obj) => { mesh.position.x = obj.value; });
pane.addBinding(tweaks, "z", { min: -10, max: 10, step: 0.01 }).on('change', (obj) => { mesh.position.z = obj.value; });


const dissolveFolder = pane.addFolder({ title: "Dissolve Effect" });
dissolveFolder.addBinding(tweaks, "meshVisible", { label: "Visible" }).on('change', (obj) => { mesh.visible = obj.value; });
dissolveFolder.addBinding(tweaks, "dissolveProgress", { min: -20, max: 20, step: 0.001, label: "Progress" }).on('change', (obj) => { dissolveUniformData.uProgress.value = obj.value; });
dissolveFolder.addBinding(tweaks, "edgeWidth", { min: 0.1, max: 8, step: 0.001, label: "Edge Width" }).on('change', (obj) => { dissolveUniformData.uEdge.value = obj.value });
dissolveFolder.addBinding(tweaks, "frequency", { min: 0.1, max: 8, step: 0.001, label: "Frequency" }).on('change', (obj) => { dissolveUniformData.uFreq.value = obj.value });
dissolveFolder.addBinding(tweaks, "amplitude", { min: 0.1, max: 20, step: 0.001, label: "Amplitude" }).on('change', (obj) => { dissolveUniformData.uAmp.value = obj.value });
dissolveFolder.addBinding(tweaks, "meshColor", { label: "Mesh Color" }).on('change', (obj) => { phyMat.color.set(obj.value) });
dissolveFolder.addBinding(tweaks, "edgeColor", { label: "Edge Color" }).on('change', (obj) => { dissolveUniformData.uEdgeColor.value.set(obj.value); });


const particleFolder = pane.addFolder({ title: "Particle" });
particleFolder.addBinding(tweaks, "particleVisible", { label: "Visible" }).on('change', (obj) => { particleMesh.visible = obj.value; });
particleFolder.addBinding(tweaks, "particleBaseSize", { min: 10.0, max: 100, step: 0.01, label: "Base size" }).on('change', (obj) => { particlesUniformData.uBaseSize.value = obj.value; });
particleFolder.addBinding(tweaks, "particleColor", { label: "Color" }).on('change', (obj) => { particlesUniformData.uColor.value.set(obj.value); });
particleFolder.addBinding(tweaks, "particleSpeedFactor", { min: 0.02, max: 0.1, step: 0.001, label: "Speed" }).on('change', (obj) => { particleSpeedFactor = obj.value });


function animate() {
    stat.update();
    orbCtrls.update();


    updateParticleAttriutes();


    if (resizeRendererToDisplaySize()) {
        const canvas = re.domElement;
        cam.aspect = canvas.clientWidth / canvas.clientHeight;
        cam.updateProjectionMatrix();
    }


    re.render(scene, cam);
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.addEventListener('orientationchange', () => {
    location.reload();
});

