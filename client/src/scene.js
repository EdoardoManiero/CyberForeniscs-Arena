/**
 * scene.js - 3D Scene Setup and Management (RENDERING LAYER)
 * 
 * Initializes the Babylon.js scene, loads 3D models, manages lighting,
 * collision detection, and scene highlights.
 * 
 * ARCHITECTURAL NOTE:
 * - This is a RENDERING LAYER component
 * - Does NOT import from Logic (taskManager) or UI (console, taskHud) layers
 * - Listens to SCENARIO_CHANGED event to update highlights
 */

import * as BABYLON from '@babylonjs/core';
import { eventBus, Events } from './eventBus.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCENE_CONFIG = {
  MODEL_PATH: './models/',
  DEFAULT_MODEL: 'secret_lab.glb',
  AMBIENT_INTENSITY: 0.9,
  CAMERA_START_POS: new BABYLON.Vector3(0, 1.6, 1.5),
  CAMERA_TARGET_POS: new BABYLON.Vector3(0, 1.2, -1.5),
  CAMERA_SPEED: 0.2,
  CAMERA_SENSITIVITY: 6000,
  GRAVITY: new BABYLON.Vector3(0, -0.05, 0),
  ELLIPSOID: new BABYLON.Vector3(0.3, 0.9, 0.3),
  HIGHLIGHT_CONFIG: {
    blurHorizontalSize: 1.0,
    blurVerticalSize: 1.0,
    blurTextureSizeRatio: 0.25
  }
};

const HIGHLIGHT_COLOR = {
  PULSE_BASE: 0.6,
  PULSE_RANGE: 0.3,
  PULSE_SPEED: 0.015
};

// ============================================================================
// STATE
// ============================================================================

let currentScenarioData = null;  // Stores scenario data from SCENARIO_CHANGED events

// ============================================================================
// EXPORTS
// ============================================================================

export let allInteractableMeshes = [];
export let permanentHighlightedMeshes = [];
export let highlightLayer = null;
export let currentHoveredMesh = null;

export function setCurrentHoveredMesh(mesh) {
  currentHoveredMesh = mesh;
}

export function clearCurrentHoveredMesh() {
  currentHoveredMesh = null;
}



// ============================================================================
// SCENE CREATION
// ============================================================================

/**
 * Creates and initializes the 3D scene
 * @param {BABYLON.Engine} engine - Babylon engine
 * @param {HTMLCanvasElement} canvas - Render canvas
 * @returns {Promise<BABYLON.Scene>} Created scene
 */
export async function createScene(engine, canvas) {
  console.log('Creating scene...');

  // Create scene
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.99, 0.99, 1.0);
  scene.collisionsEnabled = true;
  scene.gravity = SCENE_CONFIG.GRAVITY;

  // Create camera
  const camera = createCamera(scene, canvas);

  // Create lighting
  createLighting(scene);

  // Load 3D model (this already waits for scene.whenReadyAsync internally)
  const meshes = await loadModel(scene);
  console.log('Model loaded and scene ready');

  // Initialize highlight layer
  highlightLayer = new BABYLON.HighlightLayer('interactableHL', scene, 
    SCENE_CONFIG.HIGHLIGHT_CONFIG);
  highlightLayer.outerGlow = true;
  highlightLayer.innerGlow = true;

  // Setup meshes
  setupMeshes(meshes, scene);
  
  // Ensure all meshes are visible and enabled
  // This is critical for first-time login when meshes might not be properly initialized
  meshes.forEach(mesh => {
    if (mesh) {
      mesh.setEnabled(true);
      mesh.isVisible = true;
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo(true);
    }
  });
  console.log('All meshes enabled and visible');

  // Setup animation loop
  setupAnimationLoop(scene);

  // Setup camera spawn position (do this after meshes are set up)
  setupCameraSpawn(scene, camera);
  
  // Ensure camera is properly attached and active
  scene.activeCamera = camera;
  
  // Ensure canvas can receive focus for keyboard input
  if (canvas && !canvas.hasAttribute('tabindex')) {
    canvas.setAttribute('tabindex', '0');
  }
  
  // Camera controls are already attached in createCamera()
  // Don't re-attach here to avoid breaking the input manager
  // The controls will be verified and focused in main.js after render loop starts
  
  // Force all meshes to update their world matrices
  scene.meshes.forEach(mesh => {
    if (mesh && !mesh.name.startsWith('__')) {
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo(true);
    }
  });
  
  // Force scene to update all meshes
  scene.getEngine().clear(scene.clearColor, true, true, true);
  
  // Force initial render to ensure scene is visible
  // This is critical for first-time login when canvas might not have rendered yet
  scene.render();
  console.log('Initial scene render completed');

  // Setup debugging utilities
  setupDebugUtilities(scene);

  // Attach rendering layer references to scene for use by modules like TutorialManager
  // This allows controlled access to rendering layer internals without direct imports
  scene._renderingLayer = {
    allInteractableMeshes,
    permanentHighlightedMeshes,
    highlightLayer,
    setCurrentHoveredMesh,
    clearCurrentHoveredMesh,
    updateScenarioHighlights,
    camera,
    canvas
  };
  
  if (isMobile()) {
      setupMobile(scene, camera);
  }
  
  console.log('Scene created successfully');
  return scene;
}

export function isMobile() {
  // Check for touch capability AND small screen size
  const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isSmallScreen = window.innerWidth <= 900;
  
  // Also check user agent as fallback
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  return (hasTouch && isSmallScreen) || mobileUA;
}

function setupMobile(scene, camera) {
  // Initialize joysticks for mobile
  let leftJoystick, rightJoystick;
  
  if (isMobile()) {
    // Movement joystick (left side)
    leftJoystick = new BABYLON.VirtualJoystick(true);
    
    // Camera rotation joystick (right side)
    rightJoystick = new BABYLON.VirtualJoystick(false);
    
    //Mobile tap interaction
    scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
            // Get tap position
            const pickResult = scene.pick(
                scene.pointerX, 
                scene.pointerY,
                (mesh) => allInteractableMeshes.includes(mesh) // Only pick interactable meshes
            );
            
            if (pickResult.hit && pickResult.pickedMesh) {
                console.log('Mobile tap on:', pickResult.pickedMesh.name);
                // Emit the same event as desktop interaction
                eventBus.publish('MESH_CLICKED', { 
                    meshName: pickResult.pickedMesh.name,
                    mesh: pickResult.pickedMesh
                });
            }
        }
    });
    
    // Movement update loop
    scene.registerBeforeRender(() => {
        if (leftJoystick && leftJoystick.pressed) {
            const joystickX = leftJoystick.deltaPosition.x;
            const joystickY = leftJoystick.deltaPosition.y;
            
            let forward = camera.getDirection(BABYLON.Axis.Z);
            forward.y = 0;
            forward.normalize();
            
            let right = camera.getDirection(BABYLON.Axis.X);
            right.y = 0;
            right.normalize();
            
            const direction = forward.scale(joystickY).add(right.scale(joystickX));
            direction.normalize();
            
            camera.cameraDirection.copyFrom(direction.scale(0.02));
        } else {
            camera.cameraDirection.copyFrom(BABYLON.Vector3.Zero());
        }
        
        if (rightJoystick && rightJoystick.pressed) {
            camera.rotation.y += rightJoystick.deltaPosition.x * 0.01;
            camera.rotation.x += rightJoystick.deltaPosition.y * 0.01;
        }
    });
  }

  
  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
        const pickedMesh = pointerInfo.pickInfo.pickedMesh;
        // Handle interaction (works for both mouse and touch)
        if (pickedMesh && allInteractableMeshes.includes(pickedMesh)) { 
            eventBus.publish('MESH_CLICKED', { meshName: pickedMesh.name });
        }
    }
  });
}





// ============================================================================
// SCENE COMPONENT SETUP
// ============================================================================

/**
 * Creates and configures the camera
 */
function createCamera(scene, canvas) {
  const camera = new BABYLON.UniversalCamera(
    'UniversalCamera',
    SCENE_CONFIG.CAMERA_START_POS,
    scene
  );

  camera.setTarget(SCENE_CONFIG.CAMERA_TARGET_POS);
  camera.ellipsoid = SCENE_CONFIG.ELLIPSOID;
  camera.checkCollisions = true;
  camera.applyGravity = true;
  camera.speed = SCENE_CONFIG.CAMERA_SPEED;
  camera.angularSensibility = SCENE_CONFIG.CAMERA_SENSITIVITY;
  console.log('[Scene] Camera created with speed:', camera.speed);
  
  // Set up keyboard controls BEFORE attaching controls
  // This ensures keys are registered when attachControl is called
  camera.keysUp.push(87); // W
  camera.keysDown.push(83); // S
  camera.keysLeft.push(65); // A
  camera.keysRight.push(68); // D
  camera.minZ = 0.05;

  // Attach controls after keys are configured
  // Use noPreventDefault: false to ensure keyboard events are captured
  camera.attachControl(canvas, true);
  // Re-set speed after attaching controls (attachControl might reset it)
  camera.speed = SCENE_CONFIG.CAMERA_SPEED;
  console.log('[Scene] Camera speed re-set after attachControl:', camera.speed);
  
  // Ensure canvas can receive focus for keyboard input
  if (canvas && typeof canvas.focus === 'function') {
    canvas.setAttribute('tabindex', '0');
  }

  // Pointer lock on click - but respect pointer lock disable flag
  canvas.addEventListener('click', () => {
    if (!window._disablePointerLock) {
      canvas.requestPointerLock?.({ unadjustedMovement: true });
      canvas.focus();
    }
  });

  console.log('Camera created with keyboard controls configured');
  return camera;
}

/**
 * Creates and configures lighting
 */
function createLighting(scene) {
  const ambient = new BABYLON.HemisphericLight(
    'hemi',
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  ambient.intensity = SCENE_CONFIG.AMBIENT_INTENSITY;

  console.log('Lighting created');
}

/**
 * Loads 3D model from file
 */
async function loadModel(scene) {
  try {
    console.log(`Loading model: ${SCENE_CONFIG.DEFAULT_MODEL}...`);

    const { meshes } = await BABYLON.SceneLoader.ImportMeshAsync(
      '',
      SCENE_CONFIG.MODEL_PATH,
      SCENE_CONFIG.DEFAULT_MODEL,
      scene
    );

    await scene.whenReadyAsync();
    console.log(`Loaded ${meshes.length} meshes`);

    return meshes;

  } catch (error) {
    console.error('Model loading failed:', error);
    throw error;
  }
}

/**
 * Sets up mesh properties and collision
 */
function setupMeshes(meshes, scene) {
  console.log('Setting up meshes...');

  allInteractableMeshes = [];

  for (const mesh of meshes) {
    // Collision setup
    mesh.checkCollisions = true;
    const hasCollisionMetadata = mesh.metadata?.gltf?.extras?.hasCollision;
    if (typeof hasCollisionMetadata === 'boolean') {
      mesh.checkCollisions = hasCollisionMetadata;
    }

    // Picking setup
    if (mesh.getTotalVertices?.() > 0) {
      mesh.isPickable = true;
    }

    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true);

    // Add to interactable list
    if (mesh.isPickable && mesh.getTotalVertices?.() > 0 && !mesh.name.startsWith('__')) {
      allInteractableMeshes.push(mesh);
    }
  }

  console.log(`Setup complete: ${allInteractableMeshes.length} interactable meshes`);
}

/**
 * Sets up the animation loop for pulsing highlights
 */
function setupAnimationLoop(scene) {
  let pulseTime = 0;

  scene.registerBeforeRender(() => {
    if (!permanentHighlightedMeshes?.length) return;

    pulseTime += HIGHLIGHT_COLOR.PULSE_SPEED;
    const pulseIntensity = HIGHLIGHT_COLOR.PULSE_BASE + 
      Math.sin(pulseTime) * HIGHLIGHT_COLOR.PULSE_RANGE;

    permanentHighlightedMeshes.forEach(mesh => {
      // Skip currently hovered mesh (has direct hover effect)
      if (mesh === currentHoveredMesh) return;

      highlightLayer.removeMesh(mesh);
      const color = new BABYLON.Color3(
        0.4 * pulseIntensity,
        0.6 * pulseIntensity,
        pulseIntensity
      );
      highlightLayer.addMesh(mesh, color);
    });
  });

  console.log('Animation loop setup');
}

/**
 * Sets up camera spawn position
 */
function setupCameraSpawn(scene, camera) {
  const spawn =
    scene.getTransformNodeByName('Spawn') ||
    scene.getTransformNodeByName('PlayerSpawn') ||
    scene.getMeshByName('Spawn') ||
    scene.getMeshByName('PlayerSpawn');

  if (spawn) {
    const spawnPos = spawn.getAbsolutePosition();
    camera.position.copyFrom(spawnPos.add(new BABYLON.Vector3(0, 0.6, 0)));
    console.log('Camera spawned at designated point:', camera.position);
    // Set target to look forward from spawn
    camera.setTarget(spawnPos.add(new BABYLON.Vector3(0, 0.6, -5)));
    return;
  }

  // Fallback: place above scene
  const { min, max, center } = getSceneBounds(scene);
  console.log('Scene bounds:', { min, max, center });
  
  const rayStart = new BABYLON.Vector3(center.x, max.y + 20, center.z);
  const ray = new BABYLON.Ray(rayStart, new BABYLON.Vector3(0, -1, 0), (max.y - min.y) + 100);
  const hit = scene.pickWithRay(ray, m => m.isEnabled() && m.getTotalVertices?.() > 0);

  if (hit?.pickedPoint) {
    camera.position.copyFrom(hit.pickedPoint.add(new BABYLON.Vector3(0, 1.75, 0)));
    console.log('Camera positioned via raycast:', camera.position);
  } else {
    // Use default position from config
    camera.position = SCENE_CONFIG.CAMERA_START_POS.clone();
    console.log('Camera using default position:', camera.position);
  }
  
  // Ensure camera target is set correctly after positioning
  camera.setTarget(SCENE_CONFIG.CAMERA_TARGET_POS);
  console.log('Camera target set to:', SCENE_CONFIG.CAMERA_TARGET_POS);
  console.log('Camera spawn setup complete - position:', camera.position, 'target:', camera.getTarget());
}

// ============================================================================
// SCENE UPDATES
// ============================================================================

/**
 * Updates scenario highlights when scenario changes
 * Called when SCENARIO_CHANGED event is received from logic layer
 */
export function updateScenarioHighlights() {
  // Don't interrupt tutorial highlights
  if (window._tutorialHighlightPause) {
    return;
  }

  const scenario = currentScenarioData;
  if (!highlightLayer) return;

  highlightLayer.removeAllMeshes();
  permanentHighlightedMeshes.length = 0;

  if (!scenario?.interactableObjects) {
    console.log('No scenario or interactable objects defined');
    return;
  }

  const targetNames = scenario.interactableObjects;
  console.log(`Highlighting objects for: ${scenario.title}`);

  if (!allInteractableMeshes?.length) {
    console.warn('No interactable meshes found');
    return;
  }

  allInteractableMeshes.forEach(mesh => {
    // Extract identifiers
    const meshName = mesh.name || mesh.id || '';
    const meshId = mesh.id || '';
    const parentName = mesh.parent?.name || '';
    const parentId = mesh.parent?.id || '';
    const meshTag = typeof mesh.metadata?.tag !== 'undefined' ? String(mesh.metadata.tag) : '';
    const parentTag = typeof mesh.parent?.metadata?.tag !== 'undefined' ? String(mesh.parent.metadata.tag) : '';

    // Case-insensitive matching
    const meshNameLower = meshName.toLowerCase();
    const meshIdLower = meshId.toLowerCase();
    const parentNameLower = parentName.toLowerCase();
    const parentIdLower = parentId.toLowerCase();
    const meshTagLower = meshTag.toLowerCase();
    const parentTagLower = parentTag.toLowerCase();

    // Check for matches
    const isMatched = targetNames.some(targetName => {
      if (!targetName) return false;
      const targetLower = targetName.toLowerCase();

      if (meshNameLower === targetLower) return true;
      if (meshIdLower === targetLower) return true;
      if (parentNameLower === targetLower) return true;
      if (parentIdLower === targetLower) return true;
      if (meshTagLower === targetLower) return true;
      if (parentTagLower === targetLower) return true;

      if (meshNameLower.startsWith(`${targetLower}_`) || meshNameLower.startsWith(`${targetLower}-`)) return true;
      if (meshIdLower.startsWith(`${targetLower}_`) || meshIdLower.startsWith(`${targetLower}-`)) return true;

      if (meshNameLower.includes(targetLower)) return true;
      if (meshIdLower.includes(targetLower)) return true;
      if (parentNameLower.includes(targetLower)) return true;
      if (parentIdLower.includes(targetLower)) return true;
      if (meshTagLower.includes(targetLower)) return true;
      if (parentTagLower.includes(targetLower)) return true;

      return false;
    });

    if (isMatched) {
      permanentHighlightedMeshes.push(mesh);
      console.log(`Highlighted: ${meshName}`);
    }
  });
}

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Sets up debugging utilities
 */
function setupDebugUtilities(scene) {
  window.respawn = () => safeRespawn(scene, scene.activeCamera);

  // List interactable objects
  window.listInteractableObjects = () => listInteractableObjectsDebug(scene);

  console.log('Debug utilities installed');
  console.log('Tips: Press Alt+Shift+R to respawn, call window.listInteractableObjects() for debug info');
}

/**
 * Respawns the camera at a safe position
 */
export function safeRespawn(scene, camera) {
  const spawn =
    scene.getTransformNodeByName('Spawn') ||
    scene.getTransformNodeByName('PlayerSpawn') ||
    scene.getMeshByName('Spawn') ||
    scene.getMeshByName('PlayerSpawn');

  if (spawn) {
    camera.position.copyFrom(spawn.getAbsolutePosition().add(new BABYLON.Vector3(0, 0.6, 0)));
    console.log('Respawned at designated spawn point');
    return;
  }

  const { min, max, center } = getSceneBounds(scene);
  const rayStart = new BABYLON.Vector3(center.x, max.y + 20, center.z);
  const ray = new BABYLON.Ray(rayStart, new BABYLON.Vector3(0, -1, 0), (max.y - min.y) + 100);
  const hit = scene.pickWithRay(ray, m => m.isEnabled() && m.getTotalVertices?.() > 0);

  const targetPos = hit?.pickedPoint || rayStart;
  camera.position.copyFrom(targetPos.add(new BABYLON.Vector3(0, 1.75, 0)));
  console.log('Respawned at fallback position');
}

/**
 * Lists all interactable objects (debug utility)
 */
function listInteractableObjectsDebug(scene) {
  console.log('\n=== INTERACTABLE OBJECTS ===');

  const allMeshes = scene.meshes.filter(m =>
    m.isPickable && m.getTotalVertices?.() > 0 && !m.name.startsWith('__')
  );

  console.log(`Total meshes: ${allMeshes.length}`);
  allMeshes.forEach((mesh, i) => {
    const icon = mesh.metadata?.interactable === true ? '   ' : '   ';
    console.log(`${icon} ${i + 1}. "${mesh.name}" (id: ${mesh.id})`);
  });

  if (permanentHighlightedMeshes?.length) {
    console.log('\nCurrently highlighted:');
    permanentHighlightedMeshes.forEach(m => console.log(`  - ${m.name}`));
  }

  const scenario = currentScenarioData;
  if (scenario?.interactableObjects) {
    console.log('\nScenario objects:');
    scenario.interactableObjects.forEach(name => console.log(`  - ${name}`));
  }

  console.log('===========================\n');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gets the bounding box of all scene meshes
 */
function getSceneBounds(scene) {
  let min = new BABYLON.Vector3(+Infinity, +Infinity, +Infinity);
  let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

  for (const mesh of scene.meshes) {
    if (!mesh.isVisible || !mesh.getBoundingInfo) continue;
    const bb = mesh.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
    max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
  }

  const center = min.add(max).scale(0.5);
  return { min, max, center };
}

// ============================================================================
// SCENE CLEARING
// ============================================================================

/**
 * Clears the canvas/scene by disposing of all meshes and resetting state
 * @param {BABYLON.Scene} scene - The scene to clear
 */
export function clearScene(scene) {
  if (!scene) {
    console.warn('[Scene] Cannot clear: scene is null');
    return;
  }

  console.log('[Scene] Clearing scene...');

  // Detach camera controls from canvas
  if (scene.activeCamera) {
    const canvas = scene.getEngine()?.getRenderingCanvas();
    if (canvas) {
      try {
        scene.activeCamera.detachControl(canvas);
        // Reset camera's internal pointer lock state
        if (scene.activeCamera._needPointerLock !== undefined) {
          scene.activeCamera._needPointerLock = false;
        }
      } catch (e) {
        console.warn('[Scene] Error detaching camera controls:', e);
      }
    }
  }

  // Remove all highlights
  if (highlightLayer) {
    try {
      highlightLayer.removeAllMeshes();
      highlightLayer.dispose();
    } catch (e) {
      console.warn('[Scene] Error disposing highlight layer:', e);
    }
    highlightLayer = null;
  }

  // Clear highlighted meshes arrays
  allInteractableMeshes.length = 0;
  permanentHighlightedMeshes.length = 0;
  currentHoveredMesh = null;

  // Dispose of all transform nodes (includes meshes, but also other transform nodes)
  const transformNodes = scene.transformNodes.slice();
  transformNodes.forEach(node => {
    if (node) {
      try {
        node.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing transform node:', e);
      }
    }
  });

  // Dispose of all meshes (in case any weren't caught by transform nodes)
  const meshes = scene.meshes.slice(); // Create a copy to avoid modification during iteration
  meshes.forEach(mesh => {
    if (mesh) {
      try {
        mesh.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing mesh:', e);
      }
    }
  });

  // Dispose of all materials
  const materials = scene.materials.slice();
  materials.forEach(material => {
    if (material) {
      try {
        material.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing material:', e);
      }
    }
  });

  // Dispose of all textures
  const textures = scene.textures.slice();
  textures.forEach(texture => {
    if (texture) {
      try {
        texture.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing texture:', e);
      }
    }
  });

  // Dispose of all lights
  const lights = scene.lights.slice();
  lights.forEach(light => {
    if (light) {
      try {
        light.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing light:', e);
      }
    }
  });

  // Dispose of all cameras
  const cameras = scene.cameras.slice();
  cameras.forEach(camera => {
    if (camera) {
      try {
        camera.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing camera:', e);
      }
    }
  });

  // Dispose of all particle systems
  const particleSystems = scene.particleSystems.slice();
  particleSystems.forEach(ps => {
    if (ps) {
      try {
        ps.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing particle system:', e);
      }
    }
  });

  // Dispose of all skeletons
  const skeletons = scene.skeletons.slice();
  skeletons.forEach(skeleton => {
    if (skeleton) {
      try {
        skeleton.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing skeleton:', e);
      }
    }
  });

  // Dispose of all animation groups
  const animationGroups = scene.animationGroups.slice();
  animationGroups.forEach(ag => {
    if (ag) {
      try {
        ag.dispose();
      } catch (e) {
        console.warn('[Scene] Error disposing animation group:', e);
      }
    }
  });

  // Clear all event observers (beforeRender, etc.)
  // Note: Babylon.js doesn't provide direct access to clear all observers,
  // but disposing the scene will handle this. However, we can try to clear
  // any custom observers if needed.

  // Clear scenario data
  currentScenarioData = null;

  // Clear the canvas visually before disposing
  const engine = scene.getEngine();
  if (engine) {
    const canvas = engine.getRenderingCanvas();
    if (canvas) {
      // Get WebGL context and clear it
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        // Clear the canvas with the scene's clear color (or default white)
        const clearColor = scene.clearColor || new BABYLON.Color3(0.99, 0.99, 1.0);
        gl.clearColor(clearColor.r, clearColor.g, clearColor.b, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      } else {
        // Fallback: clear canvas using 2D context
        const ctx2d = canvas.getContext('2d');
        if (ctx2d) {
          ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }

  console.log('[Scene] Scene cleared');
}

/**
 * Clears the canvas visually (call after scene is disposed)
 * @param {BABYLON.Engine} engine - The Babylon engine
 */
export function clearCanvas(engine) {
  if (!engine) {
    console.warn('[Scene] Cannot clear canvas: engine is null');
    return;
  }

  const canvas = engine.getRenderingCanvas();
  if (!canvas) {
    console.warn('[Scene] Cannot clear canvas: canvas is null');
    return;
  }

  // Get WebGL context and clear it
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (gl) {
    // Clear with a neutral color (light gray/white)
    gl.clearColor(0.99, 0.99, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  } else {
    // Fallback: clear canvas using 2D context
    const ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  console.log('[Scene] Canvas cleared');
}

// ============================================================================
// EVENT LISTENERS - Rendering Layer listens to Logic Layer state changes
// ============================================================================

/**
 * Listen for scenario changes from the Logic Layer
 * When a new scenario is loaded, update local scenario data
 */
eventBus.on(Events.SCENARIO_CHANGED, (data) => {
  // Event data has structure: { scenarioId, scenario }
  // We need to extract the actual scenario object
  currentScenarioData = data.scenario || data;
  console.log(`[Scene] Scenario changed: ${currentScenarioData.title}`);
  updateScenarioHighlights();
});

console.log('Scene module loaded');
