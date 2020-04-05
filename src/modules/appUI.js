import appLogic from "./appLogic.js";
import Vue from "./vue.js";
import {Concert} from "./Concert.js";

let appUI = (function()
{
	const TimelineDateBoxWidth = 90, TimelineStartingOffset = 541;
	const DefaultColorationHue = 0; // Red
	const DefaultExceededRangeColor = "hsl(50, 100%, 50%)";
	const DefaultAnimationTimeRatio = 500;
	const TimelineSlideTime = 100;

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
				buildDataAnimation(
					allCountyData, appLogic.DefaultFact, appLogic.DefaultDataView,
					DefaultColorationHue, DefaultExceededRangeColor,
					null);
				setWaitMessage(appLogic.AppWaitType.None);
			});
	} // end initializeApp()


	function buildDataAnimation(allCountyData, fact, dataView, colorationHue, exceededRangeColor, scaleMax)
	{
		const svgObject = document.getElementById("SvgObject"),
			svgDocument = svgObject.getSVGDocument();
		const BtnSeekStart = document.getElementById("BtnSeekStart"),
			BtnStepBack = document.getElementById("BtnStepBack"),
			BtnPlay = document.getElementById("BtnPlay"),
			BtnStepForward = document.getElementById("BtnStepForward"),
			BtnPause = document.getElementById("BtnPause"),
			BtnSeekEnd = document.getElementById("BtnSeekEnd"),
			AnimationSlider = document.getElementById("AnimationSlider");
		const msPerDay = 1000 * 60 * 60 * 24;
		const UnknownValueColor = "hsl(0, 0%, 0%)";

		if(scaleMax === null)
			scaleMax = allCountyData.maxCaseCount; // CHANGE CODE HERE (this will not always be true)

		sequence = new Concert.Sequence();
		sequence.setDefaults(
			{
				applicator: Concert.Applicators.SVG_ElementAttribute,
				calculator: Concert.Calculators.Discrete,
				easing: Concert.EasingFunctions.ConstantRate,
				unit: null
			});
		
		// Animate map
		allCountyData.counties.forEach(
			county =>
			{
				let mapElement = svgDocument.getElementById("c" + county.id);
				let countyPopulation = county.population;

				if (mapElement !== null)
				{
					let keyframeTimes = [0],
					keyFrameValues = ["hsl(" + colorationHue + ", 100%, 100%)"];
				
					county.covid19Records.forEach(
						(covid19Record, index, covid19Records) =>
						{
							let keyFrameTime = Math.round(((covid19Record.date - allCountyData.firstDate) / msPerDay + 1) * animationTimeRatio);
							let keyFrameValue;

							let lastFactValue, currentFactValue, displayFactValue;
							if (fact === appLogic.FactType.Cases)
							{
								lastFactValue = (index < 1) ? 0 : covid19Records[index - 1].cumulativeCases;
								currentFactValue = covid19Record.cumulativeCases;
							}
							else if (fact === appLogic.FactType.CasesPerCapita)
							{
								lastFactValue = (index < 1) ? 0 : covid19Records[index - 1].cumulativeCases / countyPopulation;
								currentFactValue = (countyPopulation > 0) ? covid19Record.cumulativeCases / countyPopulation : "unknown";
							}
							else if (fact === appLogic.FactType.Deaths)
							{
								lastFactValue = (index < 1) ? 0 : covid19Records[index - 1].cumulativeDeaths;
								currentFactValue = covid19Record.cumulativeDeaths;
							}
							else if (fact === appLogic.FactType.DeathsPerCapita)
							{
								lastFactValue = (index < 1) ? 0 : covid19Records[index - 1].cumulativeDeaths / countyPopulation;
								currentFactValue = (countyPopulation > 0) ? covid19Record.cumulativeDeaths / countyPopulation : "unknown";
							}
							else if (fact === appLogic.FactType.DeathsPerCase)
							{
								lastFactValue = (index < 1) ? 0 : covid19Records[index - 1].cumulativeDeaths / covid19Records[index - 1].cumulativeCases;
								currentFactValue = (covid19Record.cumulativeCases > 0) ? covid19Record.cumulativeDeaths / covid19Record.cumulativeCases : 0;
							}
							else
								throw "Invalid fact parameter";
							
							if(currentFactValue === "unknown")
								keyFrameValue = UnknownValueColor;
							else
							{
								if (dataView === appLogic.DataViewType.CumulativeValue)
									displayFactValue = currentFactValue;
								else if (dataView === appLogic.DataViewType.GrowthAbsolute)
									displayFactValue = currentFactValue - lastFactValue;
								else if (dataView === appLogic.DataViewType.GrowthLogarithmicBase)
									displayFactValue = (currentFactValue - lastFactValue) / lastFactValue;

								if (displayFactValue <= scaleMax)
									keyFrameValue = Concert.Calculators.Color(displayFactValue / scaleMax, keyFrameValues[0], "hsl(" + colorationHue + ", 100%, 50%)");
								else
									keyFrameValue = exceededRangeColor; // ADD CODE HERE: need to deal with making the shift to this discrete instead of gradual
							}

							keyframeTimes.push(keyFrameTime);
							keyFrameValues.push(keyFrameValue);
						});
				
					if (svgDocument.getElementById("c" + county.id) === null)
						alert("null target");

					sequence.addTransformations(
						{
							target: mapElement,
							feature: "fill",
							keyframes: { times: keyframeTimes, values: keyFrameValues }
						});
				}
			}); // end forEach on allCountyData.counties

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
		AnimationSlider.onchange = function(eventObject) { animationSeekToSpecificDay(parseInt(eventObject.target.value, 10)); };

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
	} // end buildDataAnimation()


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
