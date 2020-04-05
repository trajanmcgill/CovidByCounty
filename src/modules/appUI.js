import appLogic from "./appLogic.js";
import Vue from "./vue.js";
import {Concert} from "./Concert.js";

const msPerDay = 1000 * 60 * 60 * 24;

let appUI = (function()
{
	const TimelineDateBoxWidth = 90, TimelineStartingOffset = 541;
	const DefaultColorationHue = 0; // Red
	const DefaultExceededRangeColor = "hsl(50, 100%, 50%)";
	const DefaultAnimationTimeRatio = 500;
	const TimelineSlideTime = 100;

	//const MapConfigPhrases = [];
	//MapConfigPhrases[appLogic.FactType.]

	let animationTimeRatio = DefaultAnimationTimeRatio;
	let totalDays = 0;
	let sequence = null;


	let loadHandlers = [], windowHandlerSet = false;
	function whenDocumentLoaded(action)
	{
		if(document.readyState === "complete")
			action();
		else
		{
			loadHandlers.push(action);
			if(!windowHandlerSet)
			{
				window.addEventListener(
					"load",
					function()
					{
						while(loadHandlers.length > 0)
							loadHandlers.shift()();
					});
			}
		}
	} // end whenDocumentLoaded()
	

	const VueApp = new Vue(
		{
			el: "#Everything",
	
			data:
				{
					waitMessage: "Loading Map...",
					waitMessageDisplay: "block",
					displayDate: "February 22", // CHANGE CODE HERE
					dateList: [],
					mapConfigPhrase: "",
					colorMaxRange: "",
					colorExceededRange: "",
					maxOverallValue: 0,
					maxDisplayValue: 0,
					infoCards: // CHANGE CODE HERE
					[
						{
							placeName: "McHenry County, Illinois",
							col1Title: "Absolute",
							col2Title: "Per 100,000",
							row1Title: "Confirmed Cases",
							row1Data1: "4,000",
							row1Data2: "386.90",
							row2Title: "Deaths",
							row2Data1: "400",
							row2Data2: "38.69",
							row3Title: "Deaths / Confirmed Case",
							row3Data1: "0.10",
							row3Data2: ""
						},
						{
							placeName: "Lake County, Illinois",
							col1Title: "Absolute",
							col2Title: "Per 100,000",
							row1Title: "Confirmed Cases",
							row1Data1: "4,000",
							row1Data2: "386.90",
							row2Title: "Deaths",
							row2Data1: "400",
							row2Data2: "38.69",
							row3Title: "Deaths / Confirmed Case",
							row3Data1: "0.10",
							row3Data2: ""
						}
					]
				},
	
			mounted: function() { whenDocumentLoaded(initializeApp); }
		});

	function initializeApp()
	{
		appLogic.loadData(
			setWaitMessage,
			function()
			{
				let allCountyData = appLogic.allCountyData;
				buildTimelineViewData(allCountyData.firstDate, allCountyData.lastDate);
				setWaitMessage(appLogic.AppWaitType.BuildingVisualization);
				setupDataAnimation(
					allCountyData, appLogic.DefaultFact, appLogic.DefaultDataView, appLogic.DefaultGrowthRangeDays,
					DefaultColorationHue, DefaultExceededRangeColor,
					0.05, appLogic.DefaultPopulationScale); // CHANGE CODE HERE: set to auto range?
				setWaitMessage(appLogic.AppWaitType.None);
			});
	} // end initializeApp()


	function buildRawMapAnimationData(allCountyData, fact, dataView, growthRangeDays, svgDocument)
	{
		let rawAnimationData = { maxOverallDisplayFactValue: 0, firstDate: allCountyData.firstDate, counties: [] };

		allCountyData.counties.forEach(
			county =>
			{
				let mapElement = svgDocument.getElementById("c" + county.id);
				if (mapElement === null)
					return;

				let currentCountyData = { id: county.id, dailyRecords: [] };

				let countyPopulation = county.population;
				county.covid19Records.forEach(
					(covid19Record, index, covid19Records) =>
					{
						let previousFactValue, currentFactValue, displayFactValue;
						if (fact === appLogic.FactType.Cases)
						{
							previousFactValue = (index < growthRangeDays) ? 0 : covid19Records[index - growthRangeDays].cumulativeCases;
							currentFactValue = covid19Record.cumulativeCases;
						}
						else if (fact === appLogic.FactType.CasesPerCapita)
						{
							previousFactValue = (index < growthRangeDays) ? 0 : covid19Records[index - growthRangeDays].cumulativeCases / countyPopulation;
							currentFactValue = (countyPopulation > 0) ? covid19Record.cumulativeCases / countyPopulation : "unknown";
						}
						else if (fact === appLogic.FactType.Deaths)
						{
							previousFactValue = (index < growthRangeDays) ? 0 : covid19Records[index - growthRangeDays].cumulativeDeaths;
							currentFactValue = covid19Record.cumulativeDeaths;
						}
						else if (fact === appLogic.FactType.DeathsPerCapita)
						{
							previousFactValue = (index < growthRangeDays) ? 0 : covid19Records[index - growthRangeDays].cumulativeDeaths / countyPopulation;
							currentFactValue = (countyPopulation > 0) ? covid19Record.cumulativeDeaths / countyPopulation : "unknown";
						}
						else if (fact === appLogic.FactType.DeathsPerCase)
						{
							previousFactValue = (index < growthRangeDays) ? 0 : covid19Records[index - growthRangeDays].cumulativeDeaths / covid19Records[index - 1].cumulativeCases;
							currentFactValue = (covid19Record.cumulativeCases > 0) ? covid19Record.cumulativeDeaths / covid19Record.cumulativeCases : 0;
						}
						else
							throw "Invalid fact parameter";
						
						if(currentFactValue === "unknown")
							displayFactValue = currentFactValue;
						else
						{
							if (dataView === appLogic.DataViewType.CumulativeValue)
								displayFactValue = currentFactValue;
							else if (dataView === appLogic.DataViewType.GrowthAbsolute)
								displayFactValue = currentFactValue - previousFactValue;
							else if (dataView === appLogic.DataViewType.GrowthLogarithmicBase)
								displayFactValue = (currentFactValue - previousFactValue) / previousFactValue;

							if (displayFactValue > rawAnimationData.maxOverallDisplayFactValue)
							rawAnimationData.maxOverallDisplayFactValue = displayFactValue;
						}
						
						currentCountyData.dailyRecords.push({ date: covid19Record.date, displayFactValue: displayFactValue });
					}); // end forEach on county.covid19Records
				
				rawAnimationData.counties.push(currentCountyData);
			}); // end forEach on counties
		
		return rawAnimationData;
	} // end buildRawMapAnimationData()


	function getMapAnimationTransformations(rawAnimationData, colorationHue, exceededRangeColor, scaleMax, svgDocument)
	{
		const UnknownValueColor = "hsl(0, 0%, 0%)";
		let transformations = [];
		
		rawAnimationData.counties.forEach(
			county =>
			{
				let keyframeTimes = [0],
					keyframeValues = ["hsl(" + colorationHue + ", 100%, 100%)"];

				county.dailyRecords.forEach(
					dailyRecord =>
					{
						let displayFactValue = dailyRecord.displayFactValue;
						let keyFrameTime = Math.round(((dailyRecord.date - rawAnimationData.firstDate) / msPerDay + 1) * animationTimeRatio);
						let keyFrameValue;

						if(displayFactValue === "unknown")
							keyFrameValue = UnknownValueColor;
						else if (displayFactValue <= scaleMax)
							keyFrameValue = Concert.Calculators.Color(displayFactValue / scaleMax, keyframeValues[0], "hsl(" + colorationHue + ", 100%, 50%)");
						else
							keyFrameValue = exceededRangeColor;
						
						keyframeTimes.push(keyFrameTime);
						keyframeValues.push(keyFrameValue);
					});
				
				transformations.push(
					{
						target: svgDocument.getElementById("c" + county.id),
						feature: "fill",
						keyframes: { times: keyframeTimes, values: keyframeValues }
					});
			});
		
		return transformations;
	} // getMapAnimationTransformations


	function setupDataAnimation(allCountyData, fact, dataView, growthRangeDays, colorationHue, exceededRangeColor, scaleMax, populationScale)
	{
		const svgObject = document.getElementById("SvgObject"),
			svgDocument = svgObject.getSVGDocument();
		const BtnSeekStart = document.getElementById("BtnSeekStart"),
			BtnStepBack = document.getElementById("BtnStepBack"),
			BtnPlay = document.getElementById("BtnPlay"),
			BtnStepForward = document.getElementById("BtnStepForward"),
			BtnPause = document.getElementById("BtnPause"),
			BtnSeekEnd = document.getElementById("BtnSeekEnd"),
			AnimationSlider = document.getElementById("AnimationSlider"),
			TimelineCoverLeft = document.getElementById("TimelineCoverLeft"),
			TimelineCoverRight = document.getElementById("TimelineCoverRight");
		
		sequence = new Concert.Sequence();
		sequence.setDefaults(
			{
				applicator: Concert.Applicators.SVG_ElementAttribute,
				calculator: Concert.Calculators.Discrete,
				easing: Concert.EasingFunctions.ConstantRate,
				unit: null
			});
		
		// Animate map
		let rawMapAnimationData = buildRawMapAnimationData(allCountyData, fact, dataView, growthRangeDays, svgDocument);
		if(scaleMax === null)
			scaleMax = rawMapAnimationData.maxOverallDisplayFactValue;
		let mapTransformations = getMapAnimationTransformations(rawMapAnimationData, colorationHue, exceededRangeColor, scaleMax, svgDocument);
		mapTransformations.forEach(transformation => { sequence.addTransformations(transformation); });
		let mapConfigPhrase;
		if (fact === appLogic.FactType.Cases)
			mapConfigPhrase = "Confirmed Cases";
		else if (fact === appLogic.FactType.CasesPerCapita)
			mapConfigPhrase = "Confirmed Cases per " + populationScale + " people";
		else if (fact === appLogic.FactType.Deaths)
			mapConfigPhrase = "Confirmed Deaths";
		else if (fact === appLogic.FactType.DeathsPerCapita)
			mapConfigPhrase = "Confirmed Deaths per " + populationScale + " people";
		else if (fact === appLogic.FactType.DeathsPerCase)
			mapConfigPhrase = "Confirmed Deaths per Confirmed Case [known fatality rate]";
		if (dataView === appLogic.DataViewType.CumulativeValue)
			mapConfigPhrase += " (Total)";
		else if (dataView === appLogic.DataViewType.GrowthAbsolute)
			mapConfigPhrase += " (Last " + growthRangeDays + " Days Total Increase)"
		else if (dataView === appLogic.DataViewType.GrowthLogarithmicBase)
			mapConfigPhrase += " (Last " + growthRangeDays + " Days Percentage Increase)"
		VueApp.mapConfigPhrase = mapConfigPhrase;
		VueApp.maxOverallValue = rawMapAnimationData.maxOverallDisplayFactValue;
		VueApp.maxDisplayValue = scaleMax;
		VueApp.colorMaxRange = "hsl(" + colorationHue + ", 100%, 50%)";
		VueApp.colorExceededRange = exceededRangeColor;

		// Animate timeline
		totalDays = Math.round((allCountyData.lastDate - allCountyData.firstDate + msPerDay) / msPerDay);
		let timelineTimes = [0], timelinePositions = [TimelineStartingOffset];
		for (let i = 0; i < totalDays; i++)
		{
			let nextLandingTime = (i + 1) * animationTimeRatio;

			timelineTimes.push(nextLandingTime - TimelineSlideTime);
			timelinePositions.push(TimelineStartingOffset - i * TimelineDateBoxWidth);

			timelineTimes.push(nextLandingTime);
			timelinePositions.push(TimelineStartingOffset - (i + 1) * TimelineDateBoxWidth);
		}
		sequence.addTransformations(
			{
				target: document.getElementById("Timeline"),
				feature: "margin-left",
				applicator: Concert.Applicators.Style,
				calculator: Concert.Calculators.Linear,
				easing: Concert.EasingFunctions.Smoothstep,
				unit: "px",
				keyframes: { times: timelineTimes, values: timelinePositions }
			});
		
		// Animate slider 
		let sliderTimes = [0], sliderPositions = [0];
		for (let i = 1; i <= totalDays; i++)
		{
			sliderTimes.push(i * animationTimeRatio);
			sliderPositions.push(i)
		}
		sequence.addTransformations(
			{
				target: document.getElementById("AnimationSlider"),
				feature: "value",
				applicator: Concert.Applicators.Property,
				calculator: Concert.Calculators.Discrete,
				keyframes: { times: sliderTimes, values: sliderPositions }
			});
		
		BtnSeekStart.onclick = animationSeekStart;
		BtnStepBack.onclick = animationStepBack;
		BtnPlay.onclick = animationPlay;
		BtnStepForward.onclick = animationStepForward;
		BtnPause.onclick = animationPause;
		BtnSeekEnd.onclick = animationSeekEnd;
		AnimationSlider.onkeydown = function(eventObject) { eventObject.preventDefault(); };
		AnimationSlider.oninput = function(eventObject) { animationSeekToSpecificDay(parseInt(eventObject.target.value, 10)); };
		TimelineCoverRight.onclick = timelineClickRight;
		TimelineCoverLeft.onclick = timelineClickLeft;

		document.onkeydown = function(eventObject)
		{
			let keyCode = eventObject.keyCode;
			if (keyCode === 36 || keyCode === 38) // home key or up arrow
				animationSeekStart();
			else if (keyCode === 37) // left arrow
				animationStepBack();
			else if (keyCode === 32) // space bar
				animationToggleStartStop();
			else if (keyCode === 39) // right arrow
				animationStepForward();
			else if (keyCode === 35 || keyCode === 40) // end key or down arrow
				animationSeekEnd();
		};

		svgDocument.onkeydown = function(eventObject) { document.onkeydown(eventObject); }
	} // end setupDataAnimation()


	function buildTimelineViewData(firstDate, lastDate)
	{
		let currentDate = firstDate;
		while (currentDate <= lastDate)
		{
			let month = currentDate.toLocaleString("en-us", { month: "long" }),
				dayOfMonth = currentDate.getDate();

			VueApp.dateList.push({ month: month, dayOfMonth: dayOfMonth });
			let nextDate = new Date(currentDate);
			nextDate.setDate(nextDate.getDate() + 1);
			currentDate = nextDate;
		}
	} // end buildTimelineData()


	function animationSeekStart()
	{ animationSeekToSpecificDay(0); }

	function animationStepBack()
	{	animationSeekToSpecificDay(Math.max(Math.round(sequence.getCurrentTime() / animationTimeRatio) - 1, 0));	}

	function animationPlay()
	{	sequence.run();	}

	function animationStepForward()
	{	animationSeekToSpecificDay(Math.min(Math.round(sequence.getCurrentTime() / animationTimeRatio) + 1, totalDays));	}

	function animationPause()
	{	sequence.stop();	}

	function animationSeekEnd()
	{	animationSeekToSpecificDay(totalDays); }

	function animationSeekToSpecificDay(dayNumber)
	{
		sequence.stop();
		sequence.seek(Math.min(Math.max(dayNumber, 0), totalDays) * animationTimeRatio);
	}

	function animationToggleStartStop()
	{
		if (sequence.isRunning())
			animationPause();
		else
			animationPlay();
	}

	function getTimelineClickDayPosition(eventObject, invert)
	{
		let boundingRect = eventObject.target.getBoundingClientRect(),
			clickPositionX = eventObject.clientX - boundingRect.x,
			dayPosition = Math.trunc(clickPositionX / TimelineDateBoxWidth) + 1,
			invertedDayPosition = eventObject.target.clientWidth / TimelineDateBoxWidth + 1 - dayPosition;
		return (invert ? invertedDayPosition : dayPosition);
	}

	function timelineClickRight(eventObject)
	{
		let AnimationSlider = document.getElementById("AnimationSlider"),
			daysToMove = getTimelineClickDayPosition(eventObject, false),
			sliderValue = parseInt(AnimationSlider.value, 10);
		if (parseInt(AnimationSlider.max, 10) - sliderValue >= daysToMove)
			animationSeekToSpecificDay(sliderValue + daysToMove);
	}

	function timelineClickLeft(eventObject)
	{
		let AnimationSlider = document.getElementById("AnimationSlider"),
			daysToMove = getTimelineClickDayPosition(eventObject, true),
			sliderValue = parseInt(AnimationSlider.value, 10);
		if (sliderValue - parseInt(AnimationSlider.min, 10) >= daysToMove)
			animationSeekToSpecificDay(sliderValue - daysToMove);
	}

	function setWaitMessage(waitType)
	{
		if (waitType === appLogic.AppWaitType.None)
		{
			VueApp.waitMessageDisplay = "none";
			VueApp.waitMessage = "";
		}
		else
		{
			VueApp.waitMessageDisplay = "block";
			if (waitType === appLogic.AppWaitType.LoadingMap)
				VueApp.waitMessage = "Loading Map...";
			if (waitType === appLogic.AppWaitType.LoadingPopulationData)
				VueApp.waitMessage = "Loading County Population Data...";
			else if (waitType === appLogic.AppWaitType.ProcessingPopulationData)
				VueApp.waitMessage = "Processing County Population Data...";
			else if (waitType === appLogic.AppWaitType.LoadingCaseData)
				VueApp.waitMessage = "Loading County Case Data...";
			else if (waitType === appLogic.AppWaitType.ProcessingCaseData)
				VueApp.waitMessage = "Processing County Case Data...";
			else if (waitType === appLogic.AppWaitType.Building)
				VueApp.waitMessage = "Building Visualization...";
		}
	} // end setWaitMessage()

})(); // end UI singleton definition

export default appUI;
