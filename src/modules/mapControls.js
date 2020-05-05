let mapControls = (function()
{
	const MapType =
		{
			RealMap: 0,
			DragMap: 1,
			RealAndDragMaps: 2
		};
	
	const CountyHighlightType =
		{
			Normal: 0,
			Selected: 1,
			Hovered: 2
		};
	
	const MouseClickMovementTolerance = 5,
		ZoomStepRatio = 2, MaxZoom = 21, MinZoom = 1, MapAspectRatio = 990 / 628,
		CountyBorderColorNormal = "#000000", CountyBorderColorSelected = "#00ffcf", CountyBorderColorHovered = "#000000",
		CountyBorderWidthNormal = "0.17828999", CountyBorderWidthSelected = "1.25", CountyBorderWidthHovered = "2";

	let vueObject = null,
		mapContainer = null, svgObject = null, svgDocument = null, mapDragObject = null,
		btnZoomIn = null, btnZoomOut = null, btnZoomFull = null,
		mapCommittedPosition = { x: 0, y: 0 },
		mapDragPosition = mapCommittedPosition,
		mapMouseDownPosition = null,
		draggingMap = false,
		pagewideKeyDownHandler = null;
	

	function handleCountyMouseEnter(eventObject)
	{
		let targetElement = eventObject.currentTarget, targetID = targetElement.id;
		if (targetID !== null && targetID.length === 6 && targetID[0] === "c")
		{
			let fipsCode = targetID.substring(1),
				infoCardExists = vueObject.infoCardCountyList.some(cardItem => ("c" + cardItem.id === targetID));
			if (infoCardExists)
				vueObject.updateInfoCardHoverHighlight(fipsCode, true);
			setCountyElementHighlighting(targetElement, CountyHighlightType.Hovered);
		}
	} // end handleCountyMouseEnter()


	function handleCountyMouseLeave(eventObject)
	{
		let targetElement = eventObject.currentTarget, targetID = targetElement.id;
		if (targetID !== null && targetID.length === 6 && targetID[0] === "c")
		{
			let fipsCode = targetID.substring(1),
				infoCardExists = vueObject.infoCardCountyList.some(cardItem => ("c" + cardItem.id === targetID));
			if (infoCardExists)
			{
				vueObject.updateInfoCardHoverHighlight(fipsCode, false);
				setCountyElementHighlighting(targetElement, CountyHighlightType.Selected);
			}
			else
				setCountyElementHighlighting(targetElement, CountyHighlightType.Normal);
		}
	} // end handleCountyMouseLeave()


	function handleMapMouseDown(eventObject)
	{
		draggingMap = false;
		mapMouseDownPosition = { x: eventObject.screenX, y: eventObject.screenY };
		document.onmousemove = svgDocument.onmousemove = monitorMapMouseMove;
		svgDocument.onmouseup = endMapClick;
	} // end handleMapMouseDown()


	function showDragMap()
	{
		let svgMapSize = getMapSizeRaw(),
			svgMapAspectRatio = svgMapSize.width / svgMapSize.height;
		
		// Size the drag map to match the main map
		if (svgMapAspectRatio < MapAspectRatio)
		{
			mapDragObject.style.width = svgMapSize.width + "px";
			mapDragObject.style.height = svgMapSize.width / MapAspectRatio;
		}
		else
		{
			mapDragObject.style.height = svgMapSize.height + "px";
			mapDragObject.style.width = svgMapSize.height * MapAspectRatio;
		}

		// Make it visible.
		vueObject.dragMapDisplay = "block";
	} // end showDragMap()


	function monitorMapMouseMove(eventObject)
	{
		let totalDragDistance = { x: eventObject.screenX - mapMouseDownPosition.x, y: eventObject.screenY - mapMouseDownPosition.y };
		if (Math.abs(totalDragDistance.x) > MouseClickMovementTolerance || Math.abs(totalDragDistance.y) > MouseClickMovementTolerance)
		{
			showDragMap();
			draggingMap = true;
			mapDragObject.onmousemove = monitorMapMouseMove;
			document.onmouseup = svgDocument.onmouseup = mapDragObject.onmouseup = function() { endMapDrag(false); };
		}
		if (draggingMap)
			setMapPosition(MapType.DragMap, { x: mapCommittedPosition.x + totalDragDistance.x, y: mapCommittedPosition.y + totalDragDistance.y });
	} // end monitorMapMouseMove()


	function endMapDrag(cancel)
	{
		if (cancel)
			setMapPosition(MapType.DragMap, mapCommittedPosition);
		else
			setMapPosition(MapType.RealMap, mapDragPosition);
		document.onmousemove = svgDocument.onmousemove = mapDragObject.onmousemove = null;
		document.onmouseup = svgDocument.onmouseup = mapDragObject.onmouseup = null;
		vueObject.dragMapDisplay = "none";
		draggingMap = false;
	} // end endMapDrag()


	function endMapClick()
	{
		mapMouseDownPosition = null;
		document.onmousemove = svgDocument.onmousemove = null;
		svgDocument.onmouseup = null;
	} // end endMapClick()


	function setCountyHighlightingByFipsCode(fipsCode, highlightType)
	{
		// Make sure this is a county element id.
		if (fipsCode !== null && fipsCode.length === 5)
			setCountyElementHighlighting(svgDocument.getElementById("c" + fipsCode), highlightType);
	} // end setCountyHighlightingByFipsCode()


	function setCountyElementHighlighting(targetElement, highlightType)
	{
		let currentZoom = vueObject.mapMagnification;

		if (targetElement !== null)
		{
			if (highlightType === CountyHighlightType.Normal)
			{
				targetElement.classList.remove("hovered");
				targetElement.style.stroke = CountyBorderColorNormal;
				targetElement.style.strokeWidth = CountyBorderWidthNormal;
			}
			else if (highlightType === CountyHighlightType.Selected)
			{
				targetElement.style.stroke = CountyBorderColorSelected;
				targetElement.style.strokeWidth = Math.max(CountyBorderWidthSelected / currentZoom, CountyBorderWidthNormal * 2);
			}
			else if (highlightType === CountyHighlightType.Hovered)
			{
				targetElement.style.stroke = CountyBorderColorHovered;
				targetElement.style.strokeWidth = Math.max(CountyBorderWidthHovered / currentZoom, CountyBorderWidthNormal * 2);
			}
		}
	} // end setCountyElementHighlighting()


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
			if (!vueObject.infoCardCountyList.some(cardEntry => (cardEntry.id === fipsCode)))
				vueObject.infoCardCountyList.push({ id: fipsCode, placeName: title });

			// Add highlighting
			setCountyElementHighlighting(clickTarget, CountyHighlightType.Selected);
		}
	} // end handleMapDoubleClick()


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
	} // end setMapPosition()


	function getMapSizeRaw()
	{
		let svgObjectRect = svgObject.getBoundingClientRect();
		return { width: svgObjectRect.width, height: svgObjectRect.height };
	} // end getMapSizeRaw()


	function getMapSizeTrue()
	{
		let rawMapSize = getMapSizeRaw(),
			trueMapSize = { width: rawMapSize.width, height: rawMapSize.height },
			rawMapAspectRatio = rawMapSize.width / rawMapSize.height;
		if (rawMapAspectRatio < MapAspectRatio)
			trueMapSize.height = trueMapSize.width / MapAspectRatio;
		else if (rawMapAspectRatio > MapAspectRatio)
			trueMapSize.width = trueMapSize.height * MapAspectRatio;
		return trueMapSize;
	} // end getMapSizeTrue()


	function setPagewideKeyDownController(keyDownHandler)
	{
		pagewideKeyDownHandler = keyDownHandler;
		if (svgDocument !== null)
			svgDocument.onkeydown = pagewideKeyDownHandler;
	} // end setPagewideKeyDownController()


	function initializeMapUI(vueAppObject)
	{
		vueObject = vueAppObject;
		mapContainer = document.getElementById("MapContainer");
		svgObject = document.getElementById("SvgObject");
		svgDocument = svgObject.getSVGDocument();
		mapDragObject = document.getElementById("DragMap");

		btnZoomIn = document.getElementById("BtnZoomIn");
		btnZoomOut = document.getElementById("BtnZoomOut");
		btnZoomFull = document.getElementById("BtnZoomFull");

		btnZoomIn.onclick = zoomInOneStepCentered;
		btnZoomOut.onclick = zoomOutOneStepCentered;
		btnZoomFull.onclick = zoomFull;
		
		svgDocument.onwheel = handleMouseWheel;
		svgDocument.onkeydown = pagewideKeyDownHandler;
		svgDocument.onmousedown = handleMapMouseDown;
		svgDocument.ondblclick = handleMapDoubleClick;
		svgDocument.querySelectorAll("path[id^='c']").forEach(
			element =>
			{
				element.addEventListener("mouseenter", handleCountyMouseEnter);
				element.addEventListener("mouseleave", handleCountyMouseLeave);
			});
	} // end initializeMapUI()


	function mapCoordsFromContainerCoords(containerCoordinates)
	{
		let mapCoordinates =
		{
			x: containerCoordinates.x - mapCommittedPosition.x,
			y: containerCoordinates.y - mapCommittedPosition.y
		};
		return mapCoordinates;
	} // end mapCoordsFromContainerCoords()

	function mapFractionalCoordsFromContainerCoords(containerCoordinates)
	{
		let trueMapSize = getMapSizeTrue(),
			absoluteMapCoordinates = mapCoordsFromContainerCoords(containerCoordinates),
			fractionalMapCoordinates =
			{
				x: absoluteMapCoordinates.x / trueMapSize.width,
				y: absoluteMapCoordinates.y / trueMapSize.height
			};
		return fractionalMapCoordinates;
	} // end mapFractionalCoordsFromContainerCoords()

	function mapContainerCoordsFromFractionalContainerCoords(fractionalCoordinates)
	{
		let containerCoordinates =
		{
			x: mapContainer.clientWidth * fractionalCoordinates.x,
			y: mapContainer.clientHeight * fractionalCoordinates.y
		}
		return containerCoordinates;
	} // end mapContainerCoordsFromFractionalContainerCoords()

	function zoom(scaleAmount, zoomPointFractional)
	{
		let rawMapSize = getMapSizeRaw(),
			newMagnification = vueObject.mapMagnification * scaleAmount;

		// Increase zoom level
		vueObject.mapMagnification = newMagnification;

		// Recenter map
		setMapPosition(
			MapType.RealAndDragMaps,
			{
				x: mapCommittedPosition.x - zoomPointFractional.x * (scaleAmount * rawMapSize.width - rawMapSize.width),
				y: mapCommittedPosition.y - zoomPointFractional.y * (scaleAmount * rawMapSize.height - rawMapSize.height)
			});
	} // end zoom()

	function zoomInOneStepCentered()
	{
		zoom(
			ZoomStepRatio,
			mapFractionalCoordsFromContainerCoords(
				mapContainerCoordsFromFractionalContainerCoords({ x: 0.5, y: 0.5 })));
	} // end zoomInOneStepCentered()

	function zoomOutOneStepCentered()
	{
		zoom(
			1 / ZoomStepRatio,
			mapFractionalCoordsFromContainerCoords(
				mapContainerCoordsFromFractionalContainerCoords({ x: 0.5, y: 0.5 })));
	} // end zoomOutOneStepCentered()

	function zoomFull()
	{
		// ADD CODE HERE
	}

	function handleMouseWheel()
	{
		// ADD CODE HERE
	}


	let objectInterface =
	{
		CountyHighlightType: CountyHighlightType,
		
		initializeMapUI: initializeMapUI,
		setPagewideKeyDownController: setPagewideKeyDownController,
		zoomInOneStepCentered: zoomInOneStepCentered,
		zoomOutOneStepCentered: zoomOutOneStepCentered,
		zoomFull: zoomFull,
//		recenterMapForNewContainerSize: recenterMapForNewContainerSize, CHANGE CODE HERE
		setCountyHighlightingByID: setCountyHighlightingByFipsCode
	};
	return objectInterface;
})(); // end mapControls singleton definition

export default mapControls;
