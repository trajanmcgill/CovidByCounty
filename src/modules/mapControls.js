let mapControls = (function()
{
	const MapType =
		{
			RealMap: 0,
			DragMap: 1,
			RealAndDragMaps: 2
		};
	
	const MouseClickMovementTolerance = 5,
		ZoomRatio = 1.5, MaxZoom = 12, MinZoom = 1;

	let vueObject = null,
		svgObject = null, svgDocument = null, mapDragObject = null,
		btnZoomIn = null, btnZoomOut = null, btnZoomFull = null,
		mapCommittedPosition = { x: 0, y: 0 },
		mapDragPosition = mapCommittedPosition,
		mapMouseDownPosition = null,
		draggingMap = false,
		initialMapSize = null,
		currentZoom = 1,
		pagewideKeyDownHandler = null;
	
	function handleMapMouseDown(eventObject)
	{
		draggingMap = false;
		mapMouseDownPosition = { x: eventObject.pageX, y: eventObject.pageY };
		document.onmousemove = svgDocument.onmousemove = monitorMapMouseMove;
		svgDocument.onmouseup = endMapClick;
	}

	function monitorMapMouseMove(eventObject)
	{
		let totalDragDistance = { x: eventObject.pageX - mapMouseDownPosition.x, y: eventObject.pageY - mapMouseDownPosition.y };
		if (Math.abs(totalDragDistance.x) > MouseClickMovementTolerance || Math.abs(totalDragDistance.y) > MouseClickMovementTolerance)
		{
			mapDragObject.style.zIndex = 3;
			draggingMap = true;
			mapDragObject.onmousemove = monitorMapMouseMove;
			document.onmouseup = svgDocument.onmouseup = mapDragObject.onmouseup = function() { endMapDrag(false); };
		}
		if (draggingMap)
			setMapPosition(MapType.DragMap, { x: mapCommittedPosition.x + totalDragDistance.x, y: mapCommittedPosition.y + totalDragDistance.y });
	}

	function endMapDrag(cancel)
	{
		if (cancel)
			setMapPosition(MapType.DragMap, mapCommittedPosition);
		else
			setMapPosition(MapType.RealMap, mapDragPosition);
		document.onmousemove = svgDocument.onmousemove = mapDragObject.onmousemove = null;
		document.onmouseup = svgDocument.onmouseup = mapDragObject.onmouseup = null;
		mapDragObject.style.zIndex = 1;
		draggingMap = false;
	}

	function endMapClick()
	{
		mapMouseDownPosition = null;
		document.onmousemove = svgDocument.onmousemove = null;
		svgDocument.onmouseup = null;
	}

	function setCountyHighlightingByFipsCode(fipsCode, highlightOn)
	{
		// Make sure this is a county element id.
		if (fipsCode !== null && fipsCode.length === 5)
			setCountyElementHighlighting(svgDocument.getElementById("c" + fipsCode), highlightOn);
	}

	function setCountyElementHighlighting(targetElement, highlightOn)
	{
		if (targetElement !== null)
		{
			if (highlightOn)
			{
				targetElement.style.stroke = "#00ffcf";
				targetElement.style.strokeWidth = "1.5";
			}
			else
			{
				targetElement.style.stroke = "#000000";
				targetElement.style.strokeWidth = "";
			}
		}
	}

	function handleMapDoubleClick(eventObject)
	{
		let clickTarget = eventObject.target,
			targetID = eventObject.target.id;

		// See if it is a county that was clicked.
		if (targetID.length === 6 && targetID[0] === "c")
		{
			let fipsCode = targetID.substring(1),
				title = "Unknown County",
				targetChildren = clickTarget.childNodes;
			for (let i = 0; i < targetChildren.length; i++)
			{
				if (targetChildren[i].nodeName === "title")
				{
					title = targetChildren[i].textContent;
					break;
				}
			}

			// Add info card for the county.
			vueObject.infoCardCountyList.push({ id: fipsCode, placeName: title });

			// Add highlighting
			setCountyElementHighlighting(clickTarget, true);
		}
	}

	function handleMouseWheel(eventObject)
	{
		doPointZoom(eventObject.clientX, eventObject.clientY, (eventObject.deltaY < 0) ? ZoomRatio : (1 / ZoomRatio));
	}

	function doPointZoom(clientX, clientY, scaleAmount)
	{
		let focalPosition =
			{
				x: mapCommittedPosition.x + clientX,
				y: mapCommittedPosition.y + clientY
			};
		zoom(focalPosition, scaleAmount);
	}

	function setMapPosition(map, newPosition)
	{
		if (map === MapType.RealMap || map === MapType.RealAndDragMaps)
		{
			mapCommittedPosition = newPosition;
			svgObject.style.left = newPosition.x + "px";
			svgObject.style.top = newPosition.y + "px";
		}
		if (map === MapType.DragMap || map === MapType.RealAndDragMaps)
		{
			mapDragPosition = newPosition;
			mapDragObject.style.left = newPosition.x + "px";
			mapDragObject.style.top = newPosition.y + "px";
		}
	}
		
	function getMapSize()
	{
		let svgObjectRect = svgObject.getBoundingClientRect();
		return { width: svgObjectRect.width, height: svgObjectRect.height };
	}

	function getMapFractionalPosition(mapContainerPosition, mapPosition, mapSize)
	{
		let fractionalX = (mapContainerPosition.x - mapPosition.x) / mapSize.width,
			fractionalY = (mapContainerPosition.y - mapPosition.y) / mapSize.height;
		return { x: fractionalX, y: fractionalY };
	}

	function zoom(focalPosition, scaleAmount)
	{
		let newMagnificationRatio = currentZoom * scaleAmount;

		if (newMagnificationRatio <= MaxZoom && newMagnificationRatio >= MinZoom)
		{
			let currentMapSize = getMapSize(),
				focalPositionFractional = getMapFractionalPosition(focalPosition, mapCommittedPosition, currentMapSize);
			setMapPosition(
				MapType.RealAndDragMaps,
				{
					x: focalPosition.x - focalPositionFractional.x * currentMapSize.width * scaleAmount,
					y: focalPosition.y - focalPositionFractional.y * currentMapSize.height * scaleAmount
				});
			rescaleMapDrawing(newMagnificationRatio);
		}
	}

	function zoomInOneStep()
	{
		zoom({ x: initialMapSize.width / 2, y: initialMapSize.height / 2 }, ZoomRatio);
	}

	function zoomOutOneStep()
	{
		zoom({ x: initialMapSize.width / 2, y: initialMapSize.height / 2 }, 1 / ZoomRatio);
	}

	function zoomFull()
	{
		rescaleMapDrawing(1);
		let newPosition = { x: 0, y: 0 };
		setMapPosition(MapType.RealAndDragMaps, newPosition);
	}

	function rescaleMapDrawing(magnificationRatio)
	{
		currentZoom = magnificationRatio;
		svgObject.style.width = mapDragObject.style.width = (initialMapSize.width * currentZoom) + "px";
		svgObject.style.height = mapDragObject.style.height = (initialMapSize.height * currentZoom) + "px";
	}

	function setPagewideKeyDownController(keyDownHandler)
	{
		pagewideKeyDownHandler = keyDownHandler;
		if (svgDocument !== null)
			svgDocument.onkeydown = pagewideKeyDownHandler;
	}

	function initializeMapUI(vueAppObject)
	{
		vueObject = vueAppObject;
		svgObject = document.getElementById("SvgObject");
		svgDocument = svgObject.getSVGDocument();
		svgDocument.onkeydown = pagewideKeyDownHandler;
		mapDragObject = document.getElementById("DragMap");
		initialMapSize = getMapSize();

		btnZoomIn = document.getElementById("BtnZoomIn");
		btnZoomOut = document.getElementById("BtnZoomOut");
		btnZoomFull = document.getElementById("BtnZoomFull");

		btnZoomIn.onclick = zoomInOneStep;
		btnZoomOut.onclick = zoomOutOneStep;
		btnZoomFull.onclick = zoomFull;
		svgDocument.onwheel = handleMouseWheel;
		svgDocument.onmousedown = handleMapMouseDown;
		svgDocument.ondblclick = handleMapDoubleClick;
	} // end initializeMapUI()

	let objectInterface =
	{
		initializeMapUI: initializeMapUI,
		setPagewideKeyDownController: setPagewideKeyDownController,
		zoomInOneStep: zoomInOneStep,
		zoomOutOneStep: zoomOutOneStep,
		zoomFull: zoomFull,
		setCountyHighlightingByID: setCountyHighlightingByFipsCode
	};
	return objectInterface;
})(); // end mapControls singleton definition

export default mapControls;
