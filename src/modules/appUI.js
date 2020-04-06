import appLogic from "./appLogic.js";
import Vue from "./vue.js";
import {Concert} from "./Concert.js";

const msPerDay = 1000 * 60 * 60 * 24;

let appUI = (function()
{
	const TimelineDateBoxWidth = 90, TimelineStartingOffset = 541;
	const DefaultUnknownValueColor = "rgb(80,80,80)";
	const DefaultZeroValueColor = "rgb(128,128,128)";
	const DefaultColorGradients =
		[
			{ start: "rgb(255, 255, 255)", end: "rgb(255, 255, 0)" },
			{ start: "rgb(255, 255, 0)", end: "rgb(255, 0, 0)" },
			{ start: "rgb(255, 0, 0)", end: "rgb(77, 0, 153)" }
		];
	const DefaultAnimationTimeRatio = 500;
	const TimelineSlideTime = 100;

	let animationTimeRatio = DefaultAnimationTimeRatio;
	let totalDays = 0;
	let sequence = null;
	let savedConfigValues = null;


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
					configurationBoxDisplay: "none",
					displayDate: "February 22", // CHANGE CODE HERE
					dateList: [],
					mapConfigPhrase: "",
					maxOverallValue: 0,
					unknownValueColor: null,
					zeroValueColor: null,
					colorGradients: [],
					colorRanges: [],
					BasicFactType: appLogic.BasicFactType,
					MeasurementType: appLogic.MeasurementType,
					DataViewType: appLogic.DataViewType,
					configBasicFact: null,
					configMeasurement: null,
					configDataView: null,
					growthRangeDays: null,
					populationScale: null,
					infoCards: // CHANGE CODE HERE
					[
						{
							placeName: "McHenry County, Illinois [SAMPLE DATA]",
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
						} /*,
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
						*/
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
				let animationSequence = setupDataAnimation(
					allCountyData, appLogic.DefaultFact, appLogic.DefaultMeasurementType, appLogic.DefaultDataView,
					appLogic.DefaultGrowthRangeDays, appLogic.DefaultPopulationScale,
					DefaultZeroValueColor, DefaultColorGradients, null, DefaultUnknownValueColor);
				animationSequence.seek(animationSequence.getStartTime());
				setWaitMessage(appLogic.AppWaitType.None);
			});
	} // end initializeApp()


	function buildRawMapAnimationData(allCountyData, basicFact, measurement, dataView, populationScale, growthRangeDays, svgDocument)
	{
		let rawAnimationData =
		{
			minNonzeroValue: null,
			maxOverallDisplayFactValue: 0,
			firstDate: allCountyData.firstDate,
			counties: []
		};

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
						let currentCases = covid19Record.cumulativeCases,
							currentDeaths = covid19Record.cumulativeDeaths,
							previousCases = (index < growthRangeDays) ? 0 : covid19Records[index - growthRangeDays].cumulativeCases,
							previousDeaths = (index < growthRangeDays) ? 0 : covid19Records[index - growthRangeDays].cumulativeDeaths;

						let currentBasicValue, previousBasicValue;
						if (basicFact === appLogic.BasicFactType.Cases)
						{
							currentBasicValue = currentCases;
							previousBasicValue = previousCases;
						}
						else if (basicFact === appLogic.BasicFactType.Deaths)
						{
							currentBasicValue = currentDeaths;
							previousBasicValue = previousDeaths;
						}
						else
							throw "Invalid fact parameter";
						
						let currentMeasuredValue, previousMeasuredValue;
						if (measurement === appLogic.MeasurementType.Absolute)
						{
							currentMeasuredValue = currentBasicValue;
							previousMeasuredValue = previousBasicValue;
						}
						else if (measurement === appLogic.MeasurementType.CaseRelative && basicFact === appLogic.BasicFactType.Deaths)
						{
							currentMeasuredValue = currentBasicValue / currentCases;
							previousMeasuredValue = previousBasicValue / previousCases;
						}
						else if (measurement === appLogic.MeasurementType.PopulationRelative)
						{
							if (countyPopulation > 0)
							{
								currentMeasuredValue = currentBasicValue / countyPopulation * populationScale;
								previousMeasuredValue = previousBasicValue / countyPopulation * populationScale;
							}
							else
							{
								currentMeasuredValue = undefined;
								previousMeasuredValue = undefined;
							}
						}
						else
							throw "Invalid fact / measurement parameter combination";
						
						let displayFactValue;
						if (typeof currentMeasuredValue === "undefined")
							displayFactValue = currentMeasuredValue;
						else
						{
							if (dataView === appLogic.DataViewType.DailyValue)
								displayFactValue = currentMeasuredValue;
							else if (dataView === appLogic.DataViewType.ChangeAbsolute)
								displayFactValue = currentMeasuredValue - previousMeasuredValue;
							else if (dataView === appLogic.DataViewType.ChangeProportional)
								displayFactValue = (currentMeasuredValue - previousMeasuredValue) / previousMeasuredValue;
							else
								throw "Invalid data view parameter";
							
							if (displayFactValue > 0 && (rawAnimationData.minNonzeroValue === null || displayFactValue < rawAnimationData.minNonzeroValue))
								rawAnimationData.minNonzeroValue = displayFactValue;
							if (displayFactValue > rawAnimationData.maxOverallDisplayFactValue)
								rawAnimationData.maxOverallDisplayFactValue = displayFactValue;
						}
						
						currentCountyData.dailyRecords.push({ date: covid19Record.date, displayFactValue: displayFactValue });
					}); // end forEach on county.covid19Records
				
				rawAnimationData.counties.push(currentCountyData);
			}); // end forEach on counties
		
		return rawAnimationData;
	} // end buildRawMapAnimationData()


	function getMapAnimationTransformations(rawAnimationData, zeroValueColor, colorGradients, colorRanges, unknownValueColor, svgDocument)
	{
		let transformations = [];
		
		rawAnimationData.counties.forEach(
			county =>
			{
				let keyframeTimes = [0],
					keyframeValues = [zeroValueColor];

				county.dailyRecords.forEach(
					dailyRecord =>
					{
						let displayFactValue = dailyRecord.displayFactValue;
						let keyFrameTime = Math.round(((dailyRecord.date - rawAnimationData.firstDate) / msPerDay + 1) * animationTimeRatio);
						let keyFrameValue;

						keyFrameValue = unknownValueColor;
						if (displayFactValue === 0)
							keyFrameValue = zeroValueColor;
						else if (displayFactValue !== "unknown")
						{
							for (let i = 0; i < colorRanges.length; i++)
							{
								let currentRange = colorRanges[i];
								if (currentRange.min <= displayFactValue && displayFactValue <= currentRange.max)
								{
									let distance = (displayFactValue - currentRange.min) / (currentRange.max - currentRange.min);
									keyFrameValue = Concert.Calculators.Color(distance, colorGradients[i].start, colorGradients[i].end);
									break;
								}
							}
						}
						
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


	function autoScaleColorRanges(minNonzeroValue, maxValue)
	{
		let colorRanges;
		if (minNonzeroValue)
		{
			let maxMinRatio = maxValue / minNonzeroValue;
			if (maxMinRatio > 10000)
			{
				let base = Math.cbrt(maxValue),
					secondPower = Math.pow(base, 2);
				colorRanges =
					[
						{ min: 0, max: base },
						{ min: base, max: secondPower },
						{ min: secondPower, max: maxValue }
					];
			}
			else if (maxMinRatio > 100)
			{
				let base = Math.sqrt(maxValue);
				colorRanges =
					[
						{ min: 0, max: base },
						{ min: base, max: maxValue }
					];
			}
			else
				colorRanges = [ { min: 0, max: maxValue }];
		}
		else
			colorRanges = [];

		return colorRanges;
	} // end autoScaleColorRanges()


	function setupDataAnimation(allCountyData, basicFact, measurement, dataView, growthRangeDays, populationScale, zeroValueColor, colorGradients, colorRanges, unknownValueColor)
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
		let rawMapAnimationData = buildRawMapAnimationData(allCountyData, basicFact, measurement, dataView, populationScale, growthRangeDays, svgDocument);
		if (colorRanges === null)
			colorRanges = autoScaleColorRanges(rawMapAnimationData.minNonzeroValue, rawMapAnimationData.maxOverallDisplayFactValue);
		let mapTransformations = getMapAnimationTransformations(rawMapAnimationData, zeroValueColor, colorGradients, colorRanges, unknownValueColor, svgDocument);
		mapTransformations.forEach(transformation => { sequence.addTransformations(transformation); });
		let mapConfigPhrase;
		if (basicFact === appLogic.BasicFactType.Cases)
			mapConfigPhrase = "Confirmed Cases";
		else if (basicFact === appLogic.BasicFactType.Deaths)
			mapConfigPhrase = "Confirmed Deaths";
		if (measurement === appLogic.MeasurementType.Absolute)
			mapConfigPhrase += " (Total)";
		else if (measurement === appLogic.MeasurementType.CaseRelative)
			mapConfigPhrase += " per Confirmed Case [known fatality rate]";
		else if (measurement === appLogic.MeasurementType.PopulationRelative)
			mapConfigPhrase += " Per " + formatNumberWithCommas(populationScale) + " People";
		if (dataView === appLogic.DataViewType.DailyValue)
			mapConfigPhrase += " (Daily Value)";
		else if (dataView === appLogic.DataViewType.ChangeAbsolute)
			mapConfigPhrase += " (Last " + growthRangeDays + " Days Total Increase)";
		else if (dataView === appLogic.DataViewType.ChangeProportional)
			mapConfigPhrase += " (Last " + growthRangeDays + " Days Percentage Increase)"
		VueApp.configBasicFact = basicFact;
		VueApp.configMeasurement = measurement;
		VueApp.configDataView = dataView;
		VueApp.growthRangeDays = growthRangeDays;
		VueApp.populationScale = populationScale;
		VueApp.mapConfigPhrase = mapConfigPhrase;
		VueApp.maxOverallValue = rawMapAnimationData.maxOverallDisplayFactValue;
		VueApp.unknownValueColor = unknownValueColor;
		VueApp.zeroValueColor = zeroValueColor;
		VueApp.colorGradients = colorGradients;
		VueApp.colorRanges = colorRanges;

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
		
		// Animate Info Title Card
		let titleCardTimes = [0], titleCardValues = [""];
		for (let i = 1; i <= totalDays; i++)
		{
			titleCardTimes.push(i * animationTimeRatio);
			let dateValue = VueApp.dateList[i - 1];
			titleCardValues.push(dateValue.month + " " + dateValue.dayOfMonth);
		}
		sequence.addTransformations(
			{
				target: VueApp,
				feature: "displayDate",
				applicator: Concert.Applicators.Property,
				calculator: Concert.Calculators.Discrete,
				keyframes: { times: titleCardTimes, values: titleCardValues }
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
		document.getElementById("ConfigPhrase").onclick = showConfigDialog;

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

		return sequence;
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

	function formatNumberWithCommas(number)
	{
		let rawString = number.toString(),
			decimalPosition = rawString.indexOf("."),
			integerPortion = (decimalPosition < 0) ? rawString : rawString.substring(0, decimalPosition),
			decimalPortion = (decimalPosition < 0) ? "" : rawString.substring(decimalPosition),
			formattedIntegerPortion = integerPortion.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,"),
			entireNumber = formattedIntegerPortion + decimalPortion;
		return entireNumber;
	} // end formatNumberWithCommas()

	function animationSeekStart()
	{
		animationSeekToSpecificDay(0);
	}

	function animationStepBack()
	{
		animationSeekToSpecificDay(Math.max(Math.round(sequence.getCurrentTime() / animationTimeRatio) - 1, 0));
	}

	function animationPlay()
	{
		sequence.run();
	}

	function animationStepForward()
	{
		animationSeekToSpecificDay(Math.min(Math.round(sequence.getCurrentTime() / animationTimeRatio) + 1, totalDays));
	}

	function animationPause()
	{
		sequence.stop();
	}

	function animationSeekEnd()
	{
		animationSeekToSpecificDay(totalDays);
	}

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

	function showConfigDialog()
	{
		savedConfigValues =
		{
			basicFact: VueApp.configBasicFact,
			measurement: VueApp.configMeasurement,
			dataView: VueApp.configDataView
		};
		VueApp.configurationBoxDisplay = "block";
		document.getElementById("BtnApplyConfigChanges").onclick = function() { hideConfigDialog(true); };
		document.getElementById("BtnCancelConfigChanges").onclick = function() { hideConfigDialog(false); };
} // end showConfigDialog()

	function hideConfigDialog(apply)
	{
		VueApp.configurationBoxDisplay = "none";
		if (apply)
		{
			setWaitMessage(appLogic.AppWaitType.BuildingVisualization);
			let animationSequence = setupDataAnimation(
				appLogic.allCountyData, VueApp.configBasicFact, VueApp.configMeasurement, VueApp.configDataView,
				VueApp.growthRangeDays, VueApp.populationScale,
				VueApp.zeroValueColor, VueApp.colorGradients, VueApp.colorRanges, VueApp.unknownValueColor);
			animationSequence.seek(animationSequence.getStartTime());
			setWaitMessage(appLogic.AppWaitType.None);
		}
		else
		{
			VueApp.configBasicFact = savedConfigValues.basicFact;
			VueApp.configMeasurement = savedConfigValues.measurement;
			VueApp.configDataView = savedConfigValues.dataView;
		}
	} // end hideConfigDialog()

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