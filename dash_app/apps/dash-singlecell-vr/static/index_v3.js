// -------------------- Globals and Constants -------------
/*global Fuse, THREE, AFRAME, JSZip, Utils*/
let report = {};
let geneList = [];
const FUSE_SEARCH_OPTIONS = {
  shouldSort: true,
  threshold: 0.6,
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: 1,
  keys: [
    "gene",
  ]
};
let currentSearch = '';
let movementSpeed = .05;
const resultElements = ["result1", "result2", "result3"];

// --------------------------------------------------------

// --------------------- HUD ------------------------------

const visibleHeightAtZDepth = ( depth ) => {
  const camera = AFRAME.scenes[0].camera;
  // compensate for cameras not positioned at z=0
  const cameraOffset = camera.position.z;
  if ( depth < cameraOffset ) depth -= cameraOffset;
  else depth += cameraOffset;

  // vertical fov in radians
  const vFOV = camera.fov * Math.PI / 180;

  // Math.abs to ensure the result is always positive
  return 2 * Math.tan( vFOV / 2 ) * Math.abs( depth );
};

const visibleWidthAtZDepth = ( depth ) => {
  const camera = AFRAME.scenes[0].camera;
  const height = visibleHeightAtZDepth( depth, camera );
  let width = height * camera.aspect;
  return width;
};

const setHudPosition = ( fovWidth, fovHeight, depth) => {
  document.getElementById('hud').object3D.position.set(-fovWidth/2 + .25, fovHeight/2 - .25, depth);
}

// -----------------------------------------------------------

const summonMenus = () => {
  const camera = document.getElementById("player-camera");
  const start = new THREE.Vector3();
  camera.object3D.getWorldPosition(start);
  const direction = new THREE.Vector3(0, 0, -2);
  direction.applyQuaternion(camera.object3D.quaternion);
  const newPos = new THREE.Vector3();
  newPos.addVectors( start, direction.multiplyScalar( 5 ) );
  const menus = document.getElementById("menuContainer").object3D;
  menus.position.set(newPos.x, newPos.y, newPos.z);
}

// Menu elements won't show up without this.
const initializeMenu = () => {
  document.getElementById("search_input").setAttribute('value', "");
  document.getElementById("result1").setAttribute('value', "");
  document.getElementById("result2").setAttribute('value', "");
  document.getElementById("result3").setAttribute('value', "");
}

const renderLegend = (annotation, clusterColors) => {
  const unorderedLegendColors = {};
  const legendColors = {};
  Object.values(clusterColors[annotation]).forEach((metadatum) => {
    unorderedLegendColors[metadatum.label] = metadatum.cluster_color;
  });

  Object.keys(unorderedLegendColors).sort().forEach((key) => {
    legendColors[key] = unorderedLegendColors[key];
  });
  
  const legend = document.getElementById('legend');
  if (Object.keys(legendColors).every((n) => Utils.isDigits(n, true))) {
    console.log("where it should be")
    const labels = Object.keys(legendColors).filter((s) => s.toLowerCase() !== 'nan');
    const maxLabel = Math.ceil(Math.max(...labels) * 100) / 100; 
    const minLabel = Math.ceil(Math.min(...labels) * 100) / 100; 
    const medianLabel = Math.ceil(labels[Math.floor(labels.length / 2)] * 100) / 100;
    const colorbar = Utils.htmlToElement(`<a-entity color-gradient="colors: ${Object.values(legendColors)}; maxLabel: ${maxLabel}; minLabel: ${minLabel}; medianLabel: ${medianLabel}; height: 4; width: 1; verticalOffset: 0" position="0 -2.5 0"></a-entity>`);
    legend.appendChild(colorbar);
    legend.setAttribute('opacity', 0);
  } else if (Object.keys(legendColors).length < 100) {
    console.log("less than 100")
    Object.keys(legendColors).forEach((key) => {
      const el = document.createElement("a-gui-label");
      el.setAttribute("width", "2.5");
      el.setAttribute("height", ".25");
      el.setAttribute("value", key);
      el.setAttribute("font-width", 6);
      el.setAttribute("font-color", "black");
      el.setAttribute("background-color", legendColors[key]);
      legend.appendChild(el);
      legend.setAttribute('opacity', 0.7);
    });
  }
}

const initializeAnnotationMenu = (annotations, clusterColors) => {
  const annotation_menu = document.getElementById('annotation_menu');

  // Ensure menu items dont overflow the container
  totalItemsHeight = annotations.length * .5;
  if (totalItemsHeight > 5) {
    adjustedContainerHeight = totalItemsHeight + 1.5;
    annotation_menu.setAttribute('height', adjustedContainerHeight);
    annotation_menu.object3D.position.set(1.85, (5 - adjustedContainerHeight) / 2, 0);
  }

  annotations.forEach((annotation) => {
    const el = document.createElement("a-gui-button");
    el.setAttribute("width", "2.5");
    el.setAttribute("height", ".5");
    el.setAttribute("text", `value: ${annotation}; width: 5; color: #d3d3d4; align: center; zOffset: .1`)
    el.setAttribute("id", `${annotation}-selector`);
    el.setAttribute("toggle", true);
    annotation_menu.appendChild(el);
  });

  // add click event after all buttons have been added in order toggle active button status
  annotations.forEach((annotation) => {
    const el = document.getElementById(`${annotation}-selector`);
    el.addEventListener('click', () => {
      const value = el.getAttribute("text").value;
      console.log(value)
      changeAnnotation(value, clusterColors);
      annotations.forEach(an => {
        if (an !== annotation) {
          document.getElementById(`${an}-selector`).components['gui-button'].setActiveState(false);
        }
      })
    });
  });
}

const changeAnnotation = (annotation, clusterColors) => {
  const legend = document.getElementById('legend');
  if (legend) {
    Utils.removeElementChildren(document.getElementById('legend'));
    renderLegend(annotation, clusterColors);
  }
  renderAnnotation(annotation, clusterColors);
}

const movement = (num) => {
  let direction = new THREE.Vector3();
  const camera = AFRAME.scenes[0].camera;
  camera.getWorldDirection( direction );
  direction.multiplyScalar(num);
  const cameraEl = document.getElementById('rig');
  var pos = cameraEl.getAttribute("position");
  pos.x += direction.x
  pos.y += direction.y
  pos.z += direction.z
  const mapPlayer = document.getElementById('mapPlayer').object3D;
  mapPlayer.position.set((pos.x + direction.x)  * .01, (pos.y + direction.y) * .01, (pos.z + direction.z) * .01);
}

// <-------------------------Abstract-------------------------------->

const viewGene = async (geneFileName, colorField) => {
  const gene = await report.file(geneFileName + ".json").async("string");
  const cellsByGene = JSON.parse(gene);
  const colors = Array.from(cellsByGene.map(cell => cell.color));
  document.getElementById('cells').setAttribute("cells", {colors: colors});
}

const renderAnnotation = (annotation, cellColors) => {
  const colors = Array.from(Object.entries(cellColors[annotation]).map(([id, cell]) => cell.cluster_color));
  document.getElementById('cells').setAttribute("cells", {colors: colors});
}

// <-------------------------------------------------------------------->

const createCellMetadataObject = (metadata) => {
  // Constant values denoting key does not represent an annotation.
  const ignore_keys = ["cell_id", "color"]

  // Infer available annotations from first cell object
  exampleCell = metadata[0];
  const annotations = [];
  Object.keys(exampleCell).forEach((key) => {
    let ignore = false;
    ignore_keys.forEach((ignore_key) => {
      if (key.includes(ignore_key)) {
        ignore = true;
      }
    });
    if (!ignore) {
      annotations.push(key);
    }
  });

  const annotationObjects = {};
  annotations.forEach((annotation) => {
    annotationObjects[annotation] = {};
    metadata.forEach((cell) => {
      annotationObjects[annotation][cell.cell_id] = {"label": cell[annotation], "label_color": null, "cluster_color": cell[`${annotation}_color`]};
    });
  });
  return [annotations, annotationObjects];
}

// ---------------------------------- Cells -------------------------------

const renderCells = (cells, cellMetadata, scale, radius) => {
  cellPositions = [];
  colors = [];
  cells.map((cell) => {
      cellPositions.push([cell.x, cell.y, cell.z]);
      colors.push(cellMetadata[Object.keys(cellMetadata)[0]][cell.cell_id].cluster_color);
  });  
  const el = document.createElement('a-entity');
  el.setAttribute("cells", {positions: cellPositions, count: cells.length, colors: colors, scale: scale, radius: radius});
  document.getElementById('cells-container').append(el);  
}

// ------------------------------------------------------------------------

// ---------------------------------- Paga --------------------------------

const scalePagaLines = (f) => {
  const line_els = Array.from(document.getElementById("graph-container").children);
  line_els.forEach(line_el => {
    const oldWidth = line_el.getAttribute("meshline").lineWidth;
    line_el.setAttribute("meshline", "lineWidth", f(oldWidth, 2));
  })
}

const renderPaga = (edges, nodes, scatter, metadata) => {
  const xValues = []; 
  const yValues = [];
  Object.values(nodes).forEach(obj => { 
    xValues.push(obj.xyz.x * 1); //.04
    yValues.push(obj.xyz.y * 1);
  });
  setInitialCameraAndGroundPosition(xValues, yValues);
  delete xValues, yValues;
  const branches = [];
  const edgeWeights = {};
  edges.forEach((edge, _) => {
      const edgeId = edge.nodes[0] + '_' + edge.nodes[1];
      if (!branches.includes(edgeId)) {
          branches.push(edgeId);
      }
    edgeWeights[edgeId] = edge.weight;
  });
  const [branch_els, _] = createCurveEnities(branches);
  const [annotations, clusterColors] = createCellMetadataObject(metadata);
  renderLegend(annotations[0], clusterColors);
  initializeAnnotationMenu(annotations, clusterColors);
  const cell_el = document.getElementById("cells-container");
  const cellEntities = [];
  const nodePositions = {};
  Object.values(nodes).forEach((cell_point, _) => {
    let x = cell_point.xyz.x * 1; //.1
    let y = cell_point.xyz.y * 1;
    let z = cell_point.xyz.z * 1;
    const cell = `<a-sphere text="value: ${cell_point.node_name}; width: 10; color: black; align: center; side: double; zOffset: .05" id="${cell_point.node_name}" position="${x} ${y} ${z}" radius=".07" watch="targetId: player-camera"></a-sphere>`;
    nodePositions[cell_point.node_name.replace(/\D/g,'')] = {"x": x, "y": y, "z": z};
    cellEntities.push(Utils.htmlToElement(cell));
  });
  cell_el.append(...cellEntities);
  const thickLines = [];
  branch_els.forEach((branch) => {
    const curveid = branch.getAttribute("id"); 
    const [startNode, endNode] = Utils.strip(curveid).split("_");
    const lineMultiplier = Utils.mobilecheck() ? 1 : 10;
    const thickLine = `<a-entity meshline="lineWidth: ${edgeWeights[Utils.strip(curveid)] * lineMultiplier}; path: ${nodePositions[startNode].x} ${nodePositions[startNode].y} ${nodePositions[startNode].z}, ${nodePositions[endNode].x} ${nodePositions[endNode].y} ${nodePositions[endNode].z}; color: black"></a-entity>`
    thickLines.push(Utils.htmlToElement(thickLine));
  });
  document.getElementById("graph-container").append(...thickLines);
  document.getElementById("graph-map").append(...thickLines.map(el => el.cloneNode()));
  renderCells(scatter, clusterColors, 1, .14); // .1, .004
}

// -------------------------------------------------------------------

// ---------------------- Seurat -------------------------------------

const renderSeurat = (scatter, metadata) => {
  const xValues = []; 
  const yValues = [];
  Object.values(scatter).forEach(obj => { 
    xValues.push(obj.x * .5);
    yValues.push(obj.y * .5);
  });
  setInitialCameraAndGroundPosition(xValues, yValues);
  delete xValues, yValues;
  const [annotations, clusterColors] = createCellMetadataObject(metadata);
  renderLegend(annotations[0], clusterColors);
  initializeAnnotationMenu(annotations, clusterColors);
  renderCells(scatter, clusterColors, .5, .14);
}

//--------------------------------------------------------------------

// ---------------------- STREAM -------------------------------------

const createBranchPoints = (curve) => {
  const curvePoints = [];
  const midpoint = curve.xyz[Math.floor(curve.xyz.length / 2)];
  const labelEntity = document.createElement("a-entity");
  const textValue = `value: ${curve.branch_id}; color:black; align: center; side: double; width: 6`;
  labelEntity.setAttribute("text", textValue);
  const labelPosition = `${midpoint.x * 100} ${midpoint.y * 100} ${midpoint.z * 100}`;
  labelEntity.setAttribute("position", labelPosition);
  labelEntity.setAttribute("watch", "targetId: player-camera");
  labelEntity.className = curve.branch_id;
  labelEntity.addEventListener('click', () => {
    currentBranch = curve.branch_id;
  })
  const curveLabels = document.getElementById('graph-labels-container');
  curveLabels.appendChild(labelEntity);
  curve.xyz.forEach((coord, _) => {
      const curvePoint = `<a-curve-point position="${coord.x * 100} ${coord.y * 100} ${coord.z * 100}"></a-curve-point>`;
      curvePoints.push(Utils.htmlToElement(curvePoint));
  });
  return curvePoints;
}

const createCurveEnities = (branches) => {
  const branch_els = [];
  const branch_draw_els = [];
  branches.forEach((branch, _) => {
      const branch_el = `<a-curve id="${branch}" ></a-curve>`;
      branch_els.push(Utils.htmlToElement(branch_el));
      const branch_draw_el = `<a-draw-curve cursor-listener curveref="#${branch}" material="shader: line; linewidth: 3; color: black;" ></a-draw-curve>`;
      branch_draw_els.push(Utils.htmlToElement(branch_draw_el));
  });
  return [branch_els, branch_draw_els];
}

const setDrawContainerContent = (branch_els, branch_draw_els) => {
  const branch_container_el = document.getElementById("curve-container");
  branch_container_el.append(...branch_els);
  const map_branch_container = document.getElementById("curve-map");
  map_branch_container.append(...branch_els.map(el => el.cloneNode()));
  const branch_draw_container = document.getElementById("graph-container");
  branch_draw_container.append(...branch_draw_els);
  const map_draw_container = document.getElementById("graph-map");
  map_draw_container.append(...branch_draw_els.map(el => el.cloneNode()));
}

const renderStream = async (curves, cells, metadata) => {
  const xValues = []; 
  const yValues = [];
  Object.values(cells).forEach(obj => { 
    xValues.push(obj.x * 100);
    yValues.push(obj.y * 100);
  });
  setInitialCameraAndGroundPosition(xValues, yValues);
  delete xValues, yValues;

  const camvec = new THREE.Vector3();
  const camera = AFRAME.scenes[0].camera;
  camera.getWorldPosition(camvec);
  document.getElementById('graph-map').object3D.lookAt(-camera.position.x, -camera.position.y, -camera.position.z);
  const branches = [];
  curves.forEach((coord, _) => {
      if (!branches.includes(coord.branch_id)) {
          branches.push(coord.branch_id);
      }
  });

  const [branch_els, branch_draw_els] = createCurveEnities(branches);

  setDrawContainerContent(branch_els, branch_draw_els);

  curves.forEach((curve) => {
    const points = createBranchPoints(curve);
    const branch_el = document.getElementById(curve.branch_id);
    branch_el.append(...points);
  })

  const [annotations, clusterColors] = createCellMetadataObject(metadata);
  initializeAnnotationMenu(annotations, clusterColors);
  renderLegend(annotations[0], clusterColors);
  renderCells(cells, clusterColors, 100, .14);
}

// -------------------------------------------------------------------

// -------------------------- Camera ---------------------------------

const setInitialCameraAndGroundPosition = (xValues, yValues) => {
  const xMax = Math.max(...xValues);
  const xMin = Math.min(...xValues);
  const xRange = xMax - xMin;
  const yMax = Math.max(...yValues);
  const yMin = Math.min(...yValues);
  const xMidpoint = (xMax + xMin) / 2;
  const yMidpoint = (yMax + yMin) / 2;

  // Make sure the ground is below the cells
  document.getElementsByClassName('environmentGround')[0].object3D.position.set(0, Math.min(yMin, -12), 0);

  document.getElementById("rig").object3D.position.set(xMidpoint, yMidpoint, xRange + 1);
}

const getZMax = (curves) => {
  let maxZ = Number.NEGATIVE_INFINITY;
  curves.forEach((curve) => {
    curve.xyz.forEach((coord) => {
      if (typeof coord.z !== 'undefined' && Math.abs(coord.z) > maxZ) {
          maxZ = Math.abs(coord.z);
      }
    });
  });
  return maxZ * 100;
}

const getMedian = (values) => {
  const sorted = [...values].sort();
  return sorted[Math.floor(sorted.length/2)];
}

// -------------------------------------------------------------------

const getGeneList = (report) => {
  const allFileNames = Object.keys(report.files);
  const geneNames = [];
  allFileNames.forEach((file) => {
    let splitName = file.split("_");
    if (splitName.length == 2 && splitName[0] === 'gene') {
      geneNames.push({'gene': splitName[1].split('.')[0]})
    } else if (splitName.length > 2 && splitName[0] === 'gene') {
      splitName.shift();
      splitName = splitName.join("_").split('.');
      splitName.pop();
      splitName = splitName.join(".");
      geneNames.push({'gene': splitName});
    }
  });
  return geneNames;
}

const createLoadingElement = () => {
  const loadingElement = document.createElement("a-video");
  loadingElement.setAttribute("id", "loadingHelp");
  loadingElement.setAttribute("loading", "");
  const loadingTips = ["/assets/scvr_loadingscreen_1.m4v", "/assets/scvr_loadingscreen_2.m4v", "/assets/scvr_loadingscreen_3.m4v"];
  loadingElement.setAttribute("src", loadingTips[Math.floor(Math.random() * loadingTips.length)]);
  document.getElementById('scene').append(loadingElement);
}

const createHelpElement = () => {
  const helpElement = document.createElement("a-video");
  helpElement.setAttribute("id", "help");
  helpElement.setAttribute("help", "");
  document.getElementById('menuContainer').append(helpElement);
}

const toggleHelp = () => {
  const helpEl = document.getElementById('help')
  helpEl.setAttribute('help', 'show', !helpEl.getAttribute('help').show)
}

const initialize = async (uuid) => {
  createLoadingElement();
  createHelpElement();
  window.onresize = () => {
    const data = document.getElementById('loadingHelp').components['loading'].data;
    document.getElementById('loadingHelp').components['loading'].update(data);
  };
  // Hide this until the loading screen goes away
  document.getElementById("hud").setAttribute('visible', false);
  const result = await Utils.unzip(uuid);
  report = result;
  const index = await result.file("index.json").async("string");
  const tool = JSON.parse(index).tool.toLowerCase();
  if (tool === "paga") {
    const edges = await result.file("graph_edges.json").async("string");
    const nodes = await result.file("graph_nodes.json").async("string");
    const scatter = await result.file("scatter.json").async("string");
    const metadata = await result.file("metadata.json").async("string");
    renderPaga(JSON.parse(edges), JSON.parse(nodes), JSON.parse(scatter), JSON.parse(metadata));
  } else if (tool === "stream") {
    const streamFile = await result.file("graph_paths.json").async("string");
    const scatterFile = await result.file("scatter.json").async("string");
    const metadataFile = await result.file("metadata.json").async("string");
    renderStream(JSON.parse(streamFile), JSON.parse(scatterFile), JSON.parse(metadataFile));
  } else {
    const scatter = await result.file("scatter.json").async("string");
    const metadata = await result.file("metadata.json").async("string");
    renderSeurat(JSON.parse(scatter), JSON.parse(metadata));
  }
  geneList = getGeneList(result);
  initializeMenu();
  // Updates the hud players position to the correct initial position.
  movement(movementSpeed);

  document.getElementById("scene").renderer.shadowMap = THREE.BasicShadowMap;

  // Hide the vr keyboard by default
  toggleKeyboard();

  document.getElementById("loadingHelp").setAttribute('loading', {'show': false});
}

window.onload = () => {
  const uuid = window.location.href.split("/").slice(-1)[0];
  initialize(uuid);
}

// --------------------- Listeners ----------------------------
const keyPressed = {};
document.body.addEventListener('keydown', (e) => {
  if (e.key === "Shift") {
    if (Utils.mobilecheck()) {
      const hud = document.getElementById("hud").object3D;
      if (!hud.visible) {
        hud.position.set(0, 0, -.5);
        hud.visible = true;
      }
      document.getElementById("cursor").object3D.visible = false;
    }
  } else if (e.key === "ArrowUp") {
      movement(movementSpeed);
  } else if (e.key === "ArrowDown") {
      movement(-movementSpeed);
  } else if (e.key === 'Enter') {
    currentSearch = '';
    updateSearch(currentSearch);
  } else if (e.key === 'Backspace') {
    currentSearch = currentSearch.slice(0, -1);
    updateSearch(currentSearch);
  } else if (e.key === 'Control') {
    keyPressed[e.key] = true;
  } else if (keyPressed['Control'] && e.key === "+") {
    e.preventDefault();
    const cells = document.getElementById('cells');
    const radius = cells.components.cells.attrValue.radius;
    cells.setAttribute('cells', 'radius', radius + .01)
  } else if (keyPressed['Control'] && e.key === "-") {
    e.preventDefault();
    const cells = document.getElementById('cells');
    const radius = cells.components.cells.attrValue.radius;
    if (radius - .01 >= 0) {
      cells.setAttribute('cells', 'radius', radius - .01);
    }
  } else if (keyPressed['Control'] && e.key === ' ') {
    e.preventDefault();
    document.getElementById('menuContainer').object3D.position.set(10, 0, 0);
  } else if (e.key === ' ') {
    summonMenus();
    currentSearch = '';
    updateSearch(currentSearch);
  } else if (e.key.length === 1) {
    currentSearch = currentSearch + e.key;
    updateSearch(currentSearch);
  }
});

const updateSearch = (value) => {
  const resultsEntity = document.getElementById("search_input");
  let result1 = '';
  let result2 = '';
  let result3 = '';
  
  let fuse = new Fuse(geneList, FUSE_SEARCH_OPTIONS);
  let result = fuse.search(currentSearch);
  result1 = result.length > 0 ? result[0].gene : "";
  result2 = result.length > 1 ? result[1].gene : "";
  result3 = result.length > 2 ? result[2].gene : "";

  resultsEntity.setAttribute('text', 'value', "Search: " + currentSearch);
  document.getElementById("result1").setAttribute('gui-button', 'text', result1);
  document.getElementById("result2").setAttribute('gui-button', 'text', result2);
  document.getElementById("result3").setAttribute('gui-button', 'text', result3);
}

document.getElementById("keyboard").addEventListener('superkeyboardchange', (e) => {
  // Hack to detect if backspace was hit on virtual keyboard.
  if (e.detail.value.length > currentSearch.length) {
    currentSearch = e.detail.value;
  } else {
    currentSearch = currentSearch.slice(0, -1);
  }
  updateSearch(currentSearch);
});

document.getElementById("keyboard").addEventListener('superkeyboardinput', (e) => {
  currentSearch = '';
  updateSearch(currentSearch);
});

document.querySelector('a-scene').addEventListener('enter-vr', () => {
  setHudPosition(visibleWidthAtZDepth(-1) - .5, visibleHeightAtZDepth(-1), -1);
  if (Utils.mobilecheck()) {
    document.getElementById('hud').object3D.visible = false;
  }
});

document.querySelector('a-scene').addEventListener('exit-vr', () => {
  setHudPosition(visibleWidthAtZDepth(-1), visibleHeightAtZDepth(-1), -1);
});

document.body.addEventListener('keyup', (e) => {
  if (e.key === "Shift") {
    if (Utils.mobilecheck()) {
      const hud = document.getElementById("hud").object3D;
      if (hud.visible) {
        hud.visible = false;
      }
      document.getElementById("cursor").object3D.visible = true;
    }
  }
  delete keyPressed[event.key];
});

resultElements.forEach((element) => {
  const result = document.getElementById(element);
  result.addEventListener("click", () => {
    viewGene('gene_' + result.getAttribute('gui-button').text, 'color');
  });
});

document.getElementById("pauseGlobalRotation").addEventListener("click", () => {
  const drawContainer = document.getElementById("drawContainer");
  if (drawContainer.isPlaying) {
    drawContainer.pause();
    drawContainer.setAttribute("rotation", "0 0 0");
  } else {
    drawContainer.play();
  }
});

// ---------------------------------------------------------------------

toggleKeyboard = () => {
  const keyboard = document.getElementById('keyboard');
  keyboard.getAttribute('visible') ? keyboard.components['super-keyboard'].close() : keyboard.components['super-keyboard'].open()
}

adjustMovementSpeed = (step) => {
  newSpeed = movementSpeed + step;
  movementSpeed = newSpeed > 0 ? newSpeed : movementSpeed;
}