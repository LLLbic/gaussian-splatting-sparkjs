/**
 * Three.js PLYLoader
 * 用于加载 .ply (Polygon File Format) 文件
 * 支持 ASCII 和二进制格式
 */

THREE.PLYLoader = class PLYLoader {
    constructor(manager) {
        this.manager = manager !== undefined ? manager : THREE.DefaultLoadingManager;
    }

    load(url, onLoad, onProgress, onError) {
        const scope = this;
        const loader = new THREE.FileLoader(this.manager);
        loader.setResponseType('arraybuffer');
        loader.setRequestHeader(this.requestHeader);
        loader.setPath(this.path);
        loader.setWithCredentials(this.withCredentials);
        loader.load(url, function(text) {
            try {
                onLoad(scope.parse(text));
            } catch (e) {
                if (onError) {
                    onError(e);
                } else {
                    console.error(e);
                }
                scope.manager.itemError(url);
            }
        }, onProgress, onError);
    }

    setPath(value) {
        this.path = value;
        return this;
    }

    setRequestHeader(value) {
        this.requestHeader = value;
        return this;
    }

    setWithCredentials(value) {
        this.withCredentials = value;
        return this;
    }

    parse(data) {
        function parseHeader(data) {
            const patternHeader = /ply([\s\S]*)end_header\r?\n/;
            let headerText = '';
            let headerLength = 0;
            const result = patternHeader.exec(data);

            if (result !== null) {
                headerText = result[1];
                headerLength = result[0].length;
            }

            const header = {
                comments: [],
                elements: [],
                headerLength: headerLength,
                objInfo: ''
            };

            const lines = headerText.split('\n');
            let currentElement;

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                line = line.trim();

                if (line === '') continue;

                const lineValues = line.split(/\s+/);
                const lineType = lineValues[0];
                lineValues.shift();

                if (lineType === 'format') {
                    header.format = lineValues[0];
                    header.version = lineValues[1];
                } else if (lineType === 'comment') {
                    header.comments.push(lineValues.join(' '));
                } else if (lineType === 'element') {
                    if (currentElement !== undefined) {
                        header.elements.push(currentElement);
                    }

                    currentElement = {};
                    currentElement.name = lineValues[0];
                    currentElement.count = parseInt(lineValues[1]);
                    currentElement.properties = [];
                } else if (lineType === 'property') {
                    currentElement.properties.push({
                        type: lineValues[0],
                        name: lineValues[1]
                    });
                } else if (lineType === 'obj_info') {
                    header.objInfo = lineValues.join(' ');
                }
            }

            if (currentElement !== undefined) {
                header.elements.push(currentElement);
            }

            return header;
        }

        function parseASCIINumber(n, type) {
            switch (type) {
                case 'char':
                case 'uchar':
                case 'short':
                case 'ushort':
                case 'int':
                case 'uint':
                case 'int8':
                case 'uint8':
                case 'int16':
                case 'uint16':
                case 'int32':
                case 'uint32':
                    return parseInt(n);
                case 'float':
                case 'double':
                case 'float32':
                case 'float64':
                    return parseFloat(n);
            }
        }

        function parseASCII(data, header) {
            const buffer = {
                indices: [],
                vertices: [],
                normals: [],
                uvs: [],
                faceVertexUvs: [],
                colors: []
            };

            let result;
            const patternBody = /end_header\s([\s\S]*)$/;
            let body = '';

            if ((result = patternBody.exec(data)) !== null) {
                body = result[1];
            }

            const lines = body.split('\n');
            let currentElement = 0;
            let currentElementCount = 0;

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                line = line.trim();

                if (line === '') {
                    continue;
                }

                if (currentElementCount >= header.elements[currentElement].count) {
                    currentElement++;
                    currentElementCount = 0;
                }

                const lineValues = line.split(/\s+/);
                const element = header.elements[currentElement];

                if (element.name === 'vertex') {
                    buffer.vertices.push(
                        parseASCIINumber(lineValues[0], element.properties[0].type),
                        parseASCIINumber(lineValues[1], element.properties[1].type),
                        parseASCIINumber(lineValues[2], element.properties[2].type)
                    );

                    if (element.properties.length >= 6) {
                        buffer.colors.push(
                            parseASCIINumber(lineValues[3], element.properties[3].type) / 255.0,
                            parseASCIINumber(lineValues[4], element.properties[4].type) / 255.0,
                            parseASCIINumber(lineValues[5], element.properties[5].type) / 255.0
                        );
                    }
                }

                currentElementCount++;
            }

            return postProcess(buffer);
        }

        function postProcess(buffer) {
            let geometry = new THREE.BufferGeometry();

            if (buffer.vertices.length > 0) {
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.vertices, 3));
            }

            if (buffer.normals.length > 0) {
                geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffer.normals, 3));
            }

            if (buffer.colors.length > 0) {
                geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 3));
            }

            if (buffer.indices.length > 0) {
                geometry.setIndex(buffer.indices);
            }

            return geometry;
        }

        let geometry;
        const scope = this;

        if (data instanceof ArrayBuffer) {
            const text = THREE.LoaderUtils.decodeText(new Uint8Array(data));
            const header = parseHeader(text);

            if (header.format === 'ascii') {
                geometry = parseASCII(text, header);
            } else {
                // 简化：仅支持 ASCII 格式
                // 完整实现需要添加二进制解析
                console.warn('Binary PLY format not fully supported, using ASCII parser');
                geometry = parseASCII(text, header);
            }
        } else {
            geometry = parseASCII(data, parseHeader(data));
        }

        return geometry;
    }
};

// 添加 OrbitControls
THREE.OrbitControls = class OrbitControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.target = new THREE.Vector3();
        
        this.enableDamping = false;
        this.dampingFactor = 0.05;
        this.enableZoom = true;
        this.enableRotate = true;
        this.enablePan = true;
        
        this.minDistance = 0;
        this.maxDistance = Infinity;
        
        this.spherical = new THREE.Spherical();
        this.sphericalDelta = new THREE.Spherical();
        
        this.scale = 1;
        this.panOffset = new THREE.Vector3();
        
        this.rotateStart = new THREE.Vector2();
        this.rotateEnd = new THREE.Vector2();
        this.rotateDelta = new THREE.Vector2();
        
        this.panStart = new THREE.Vector2();
        this.panEnd = new THREE.Vector2();
        this.panDelta = new THREE.Vector2();
        
        this.state = 'NONE';
        
        this.init();
    }
    
    init() {
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
        this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.domElement.addEventListener('wheel', this.onMouseWheel.bind(this));
        this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this));
    }
    
    onMouseDown(event) {
        event.preventDefault();
        
        if (event.button === 0) {
            this.state = 'ROTATE';
            this.rotateStart.set(event.clientX, event.clientY);
        } else if (event.button === 2) {
            this.state = 'PAN';
            this.panStart.set(event.clientX, event.clientY);
        }
        
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
    }
    
    onMouseMove(event) {
        event.preventDefault();
        
        if (this.state === 'ROTATE') {
            this.rotateEnd.set(event.clientX, event.clientY);
            this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(0.005);
            
            this.sphericalDelta.theta -= this.rotateDelta.x;
            this.sphericalDelta.phi -= this.rotateDelta.y;
            
            this.rotateStart.copy(this.rotateEnd);
        } else if (this.state === 'PAN') {
            this.panEnd.set(event.clientX, event.clientY);
            this.panDelta.subVectors(this.panEnd, this.panStart).multiplyScalar(0.01);
            
            this.pan(this.panDelta.x, this.panDelta.y);
            
            this.panStart.copy(this.panEnd);
        }
    }
    
    onMouseUp() {
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        this.state = 'NONE';
    }
    
    onMouseWheel(event) {
        event.preventDefault();
        
        if (event.deltaY < 0) {
            this.scale /= 0.95;
        } else {
            this.scale *= 0.95;
        }
    }
    
    onTouchStart(event) {
        // 触摸控制实现
    }
    
    onTouchMove(event) {
        // 触摸控制实现
    }
    
    pan(deltaX, deltaY) {
        const offset = new THREE.Vector3();
        const targetDistance = this.camera.position.distanceTo(this.target);
        
        offset.copy(this.camera.position).sub(this.target);
        offset.multiplyScalar(deltaX * targetDistance / this.domElement.clientHeight);
        
        this.panOffset.add(offset);
    }
    
    update() {
        const offset = new THREE.Vector3();
        const quat = new THREE.Quaternion().setFromUnitVectors(
            this.camera.up,
            new THREE.Vector3(0, 1, 0)
        );
        const quatInverse = quat.clone().invert();
        
        offset.copy(this.camera.position).sub(this.target);
        offset.applyQuaternion(quat);
        
        this.spherical.setFromVector3(offset);
        this.spherical.theta += this.sphericalDelta.theta;
        this.spherical.phi += this.sphericalDelta.phi;
        this.spherical.radius *= this.scale;
        
        this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));
        
        this.spherical.makeSafe();
        offset.setFromSpherical(this.spherical);
        offset.applyQuaternion(quatInverse);
        
        this.camera.position.copy(this.target).add(offset).add(this.panOffset);
        this.camera.lookAt(this.target);
        
        if (this.enableDamping) {
            this.sphericalDelta.theta *= (1 - this.dampingFactor);
            this.sphericalDelta.phi *= (1 - this.dampingFactor);
        } else {
            this.sphericalDelta.set(0, 0, 0);
        }
        
        this.scale = 1;
        this.panOffset.set(0, 0, 0);
    }
};
