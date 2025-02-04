import appLogic from "./appLogic.js?ver=1.2.1";
import mapControls from "./mapControls.js?ver=1.2.1";
import Vue from "./vue.js?ver=1.2.1";
import {Concert} from "./Concert.js?ver=1.2.1";

let appUI = (function()
{
	const TimelineDateBoxWidth = 90;
	const DefaultAnimationTimeRatio = 500;

	let mapContainer = null, svgObject = null, svgDocument = null;
	let animationTimeRatio = DefaultAnimationTimeRatio;
	let sequence = null;
	let animationEnabled = false, animationTimeout = null, currentAnimationDay = 0;
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
				windowHandlerSet = true;
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
					pageInfoBoxDisplay: "none",
					dragMapDisplay: "none",
					mapMagnification: 1,
					mapContainerWidth: 0,
					mapContainerHeight: 0,
					mapObjectPosition: { x: 0, y: 0 },
					displayDateNumber: null,
					firstDateNumber: null,
					totalDays: 0,
					maxOverallValue: 0,
					coloration: { unknown: null, zero: null, ranges: [] },
					BasicFactType: appLogic.BasicFactType,
					MeasurementType: appLogic.MeasurementType,
					DataViewType: appLogic.DataViewType,
					configBasicFact: null,
					configMeasurement: null,
					configDataView: null,
					growthRangeDays: null,
					populationScale: null,
					infoCardCountyList: []
				},

			computed:
				{
					configurationErrors:
						function()
						{
							let errors = [];
							if (this.configMeasurement === appLogic.MeasurementType.CaseRelative && this.configBasicFact !== appLogic.BasicFactType.Deaths)
								errors.push("\"Per Case (Fatality Rate)\" measurement can only be selected with the \"Cumulative Deaths\" basic fact. (Cases per case doesn't make sense.)");
							return errors;
						},

					displayDateString:
						function()
						{
							let dateString = "";
							if (this.displayDateNumber !== null)
							{
								let dateLocal = appLogic.data.getDateFromDateNumber(this.displayDateNumber);
								dateString = (dateLocal.toLocaleString("en-us", { month: "long" }) + " " + dateLocal.getDate());
							}
							return dateString;
						},
					
					formattedPopulationScale:
						function()
						{
							let populationScale = this.populationScale, formattedValue = "";
							if (populationScale !== null)
							{
								formattedValue = formatNumberWithCommas(populationScale) + " Persons";
								if (populationScale === 100)
									formattedValue += " (population percentage)"
							}
							return formattedValue;
						},

					infoCardPopulationScale:
						function()
						{
							let populationScale = this.populationScale, formattedValue = "";
							if (populationScale !== null)
								formattedValue = "Per " + formatNumberWithCommas(populationScale);
							return formattedValue;
						},

					formattedGrowthRangeDays:
						function()
						{
							let growthRangeDays = this.growthRangeDays, formattedValue = "";
							if (growthRangeDays !== null)
							{
								if (growthRangeDays === 1)
									formattedValue = "24 hours";
								else if (growthRangeDays > 7 && growthRangeDays % 7 === 0)
									formattedValue = (growthRangeDays / 7) + " weeks";
								else
									formattedValue = growthRangeDays + " days";
							}
							return formattedValue;
						},

					dateList:
						function()
						{
							let list = [], firstDateNumber = this.firstDateNumber, totalDays = this.totalDays;
							if (firstDateNumber !== null)
							{
								for (let i = 0; i < totalDays; i++)
									list.push(appLogic.data.getDateFromDateNumber(firstDateNumber + i));
							}
							return list;
						},

					timelineLeftBufferWidth:
						function()
						{
							let firstDateNumber = this.firstDateNumber,
								displayDateNumber = this.displayDateNumber,
								totalDays = this.totalDays,
								currentTimelinePosition = (displayDateNumber === null) ? 0 : (displayDateNumber - firstDateNumber + 1);
							return (Math.max(totalDays + 1 - 2 * currentTimelinePosition, 0) * TimelineDateBoxWidth);
						},
					
					timelineRightBufferWidth:
						function()
						{
							let firstDateNumber = this.firstDateNumber,
								displayDateNumber = this.displayDateNumber,
								totalDays = this.totalDays,
								currentTimelinePosition = (displayDateNumber === null) ? 0 : (displayDateNumber - firstDateNumber + 1);
							return (Math.max(totalDays - 1 - 2 * (totalDays - currentTimelinePosition), 0) * TimelineDateBoxWidth);
						},
					
					timelineWidth:
						function()
						{
							return TimelineDateBoxWidth * this.totalDays + this.timelineLeftBufferWidth + this.timelineRightBufferWidth;
						},

					infoCards:
						function()
						{
							let displayDateNumber = this.displayDateNumber, growthRangeDays = this.growthRangeDays,
								populationScale = this.populationScale;
							let cards = [];
							this.infoCardCountyList.forEach(
								countyCard =>
								{
									let county = appLogic.data.getCountyByID(countyCard.id);
									if (county === null)
									{
										cards.push(
											{
												id: countyCard.id,
												placeName: countyCard.placeName,
												dataExists: false
											});
									}
									else
									{
										let matchingRecordIndex, currentDailyRecord, previousDailyRecord;
										if (displayDateNumber === null)
											currentDailyRecord = previousDailyRecord = { cases : 0, deaths: 0 };
										else
										{
											matchingRecordIndex = county.dailyRecords.findIndex(dailyRecord => (dailyRecord.date === displayDateNumber));
											currentDailyRecord = (matchingRecordIndex >= 0) ? county.dailyRecords[matchingRecordIndex] : { cases : 0, deaths: 0 };

											matchingRecordIndex = county.dailyRecords.findIndex(dailyRecord => (dailyRecord.date === displayDateNumber - growthRangeDays));
											previousDailyRecord = (matchingRecordIndex >= 0) ? county.dailyRecords[matchingRecordIndex] : { cases : 0, deaths: 0 };
										}
										let currentCases = currentDailyRecord.cases,
											previousCases = previousDailyRecord.cases,
											casesAbsoluteChange = currentCases - previousCases,
											casesByPopulation = currentCases / county.population * populationScale,
											casesByPopulationChange = casesByPopulation - previousCases / county.population * populationScale,
											casesChangePercentage = (casesAbsoluteChange === 0) ? 0 : ((previousCases === 0) ? Number.POSITIVE_INFINITY : 100 * casesAbsoluteChange / previousCases),
											currentDeaths = currentDailyRecord.deaths,
											previousDeaths = previousDailyRecord.deaths,
											deathsAbsoluteChange = currentDeaths - previousDeaths,
											deathsChangePercentage = (deathsAbsoluteChange === 0) ? 0 : ((previousDeaths === 0) ? Number.POSITIVE_INFINITY : 100 * deathsAbsoluteChange / previousDeaths),
											deathsByPopulation = currentDeaths / county.population * populationScale,
											deathsByPopulationChange = deathsByPopulation - previousDeaths / county.population * populationScale,
											deathsPerCase = (currentDeaths === 0) ? 0 : currentDeaths / currentCases,
											previousDeathsPerCase = (previousDeaths === 0) ? 0 : previousDeaths / previousCases,
											deathsPerCaseChange = deathsPerCase - previousDeathsPerCase,
											deathsPerCaseChangePercentage = (deathsPerCaseChange === 0) ? 0 : ((previousDeathsPerCase === 0) ? Number.POSITIVE_INFINITY : 100 * deathsPerCaseChange / previousDeathsPerCase),
											mapElement = svgDocument.getElementById("c" + county.id.toString().padStart(appLogic.FIPS_Length, "0")),
											currentColoration = mapElement.getAttribute("fill");
										cards.push(
											{
												id: countyCard.id,
												placeName: countyCard.placeName,
												population: formatNumberWithCommas(county.population),
												dataExists: true,
												casesAbsolute: currentCases,
												casesAbsoluteChange: casesAbsoluteChange,
												casesChangePercentage: casesChangePercentage,
												casesByPopulation: casesByPopulation,
												casesByPopulationChange: casesByPopulationChange,
												deathsAbsolute: currentDeaths,
												deathsAbsoluteChange: deathsAbsoluteChange,
												deathsChangePercentage: deathsChangePercentage,
												deathsByPopulation: deathsByPopulation,
												deathsByPopulationChange: deathsByPopulationChange,
												deathsPerCase: deathsPerCase,
												deathsPerCaseChange: deathsPerCaseChange,
												deathsPerCaseChangePercentage: deathsPerCaseChangePercentage,
												coloration: currentColoration
											});
									}
								});
							return cards;
						},
					
					infoCardInstructionDisplay:
						function()
						{
							let displayStyle = (this.infoCardCountyList.length < 1 ? "block" : "none");
							return displayStyle;
						},

					maxColorRangeDataValue:
						function()
						{
							if (this.coloration.ranges.length < 1)
								return null;
							else
								return this.coloration.ranges[this.coloration.ranges.length-1].dataRange.max;
						},
					
					mapConfigPhrase:
						function()
						{
							let configPhrase = "";
							if (this.configBasicFact === appLogic.BasicFactType.Cases)
								configPhrase = "Cumulative Cases";
							else if (this.configBasicFact === appLogic.BasicFactType.Deaths)
								configPhrase = "Cumulative Deaths";
							if (this.configMeasurement === appLogic.MeasurementType.Absolute)
								configPhrase += " (Total)";
							else if (this.configMeasurement === appLogic.MeasurementType.CaseRelative)
								configPhrase += " per Case [fatality rate]";
							else if (this.configMeasurement === appLogic.MeasurementType.PopulationRelative)
								configPhrase += " Per " + formatNumberWithCommas(this.populationScale) + " People";
							if (this.configDataView === appLogic.DataViewType.DailyValue)
								configPhrase += " (Daily Value)";
							else if (this.configDataView === appLogic.DataViewType.ChangeAbsolute)
								configPhrase += " (Last " + this.growthRangeDays + " Days Total Increase)";
							else if (this.configDataView === appLogic.DataViewType.ChangeProportional)
								configPhrase += " (Last " + this.growthRangeDays + " Days Percentage Increase)"
							return configPhrase;
						},
					
					mapObjectLeftPosition: function () { return (this.mapObjectPosition.x + "px"); },
					mapObjectTopPosition: function () { return (this.mapObjectPosition.y + "px"); },
					mapObjectWidth: function() { return ((this.mapContainerWidth * this.mapMagnification) + "px"); },
					mapObjectHeight: function() { return ((this.mapContainerHeight * this.mapMagnification) + "px"); }
				},

			methods:
				{
					formatInfoCardDisplayNumber: function(rawNumber, asInteger, significantDigits)
					{
						rawNumber = parseFloat(rawNumber);

						let displayNumber;
						if (rawNumber === 0)
							displayNumber = 0;
						else if (asInteger || rawNumber >= 1000 || rawNumber <= -1000)
						{
							let log10 = Math.log10(Math.abs(rawNumber)),
								truncatedLog10 = Math.trunc(log10),
								digits = 1 + (log10 > truncatedLog10) ? truncatedLog10 + 1 : truncatedLog10;
							displayNumber = rawNumber.toPrecision(digits);
						}
						else
							displayNumber = rawNumber.toPrecision(significantDigits);
						
						return displayNumber;
					},

					formatDataRangeDisplayNumber: function(rawNumber)
					{
						let displayValue = this.formatInfoCardDisplayNumber(rawNumber, false, 4);
						if (this.configDataView === appLogic.DataViewType.ChangeProportional)
							displayValue = (parseFloat(displayValue) * 100).toPrecision(4) + "%";
						return displayValue;
					},

					isCurrentFact: function(factName)
					{
						let factMatches =
						(
							(factName === "casesAbsolute" && this.configBasicFact === appLogic.BasicFactType.Cases && this.configMeasurement === appLogic.MeasurementType.Absolute && this.configDataView === appLogic.DataViewType.DailyValue)
							|| (factName === "casesByPopulation" && this.configBasicFact === appLogic.BasicFactType.Cases && this.configMeasurement === appLogic.MeasurementType.PopulationRelative && this.configDataView === appLogic.DataViewType.DailyValue)
							|| (factName === "casesAbsoluteChange" && this.configBasicFact === appLogic.BasicFactType.Cases && this.configMeasurement === appLogic.MeasurementType.Absolute && this.configDataView === appLogic.DataViewType.ChangeAbsolute)
							|| (factName === "casesChangePercentage" && this.configBasicFact === appLogic.BasicFactType.Cases && this.configMeasurement === appLogic.MeasurementType.Absolute && this.configDataView === appLogic.DataViewType.ChangeProportional)
							|| (factName === "casesByPopulationChange" && this.configBasicFact === appLogic.BasicFactType.Cases && this.configMeasurement === appLogic.MeasurementType.PopulationRelative && this.configDataView === appLogic.DataViewType.ChangeAbsolute)
							|| (factName === "deathsAbsolute" && this.configBasicFact === appLogic.BasicFactType.Deaths && this.configMeasurement === appLogic.MeasurementType.Absolute && this.configDataView === appLogic.DataViewType.DailyValue)
							|| (factName === "deathsByPopulation" && this.configBasicFact === appLogic.BasicFactType.Deaths && this.configMeasurement === appLogic.MeasurementType.PopulationRelative && this.configDataView === appLogic.DataViewType.DailyValue)
							|| (factName === "deathsPerCase" && this.configBasicFact === appLogic.BasicFactType.Deaths && this.configMeasurement === appLogic.MeasurementType.CaseRelative && this.configDataView === appLogic.DataViewType.DailyValue)
							|| (factName === "deathsAbsoluteChange" && this.configBasicFact === appLogic.BasicFactType.Deaths && this.configMeasurement === appLogic.MeasurementType.Absolute && this.configDataView === appLogic.DataViewType.ChangeAbsolute)
							|| (factName === "deathsChangePercentage" && this.configBasicFact === appLogic.BasicFactType.Deaths && this.configMeasurement === appLogic.MeasurementType.Absolute && this.configDataView === appLogic.DataViewType.ChangeProportional)
							|| (factName === "deathsByPopulationChange" && this.configBasicFact === appLogic.BasicFactType.Deaths && this.configMeasurement === appLogic.MeasurementType.PopulationRelative && this.configDataView === appLogic.DataViewType.ChangeAbsolute)
							|| (factName === "deathsPerCaseChange" && this.configBasicFact === appLogic.BasicFactType.Deaths && this.configMeasurement === appLogic.MeasurementType.CaseRelative && this.configDataView === appLogic.DataViewType.ChangeAbsolute)
							|| (factName === "deathsPerCaseChangePercentage" && this.configBasicFact === appLogic.BasicFactType.Deaths && this.configMeasurement === appLogic.MeasurementType.CaseRelative && this.configDataView === appLogic.DataViewType.ChangeProportional)
						);
						return factMatches;
					},

					mouseenterInfoCard: function(eventObject)
					{
						let infoCard = eventObject.currentTarget,
							fipsCode = infoCard.id.substring(9);
						mapControls.setCountyHighlightingByID(fipsCode, mapControls.CountyHighlightType.Hovered);
						this.updateInfoCardHoverHighlight(fipsCode, true);
					},

					mouseleaveInfoCard: function(eventObject)
					{
						let infoCard = eventObject.currentTarget,
							fipsCode = infoCard.id.substring(9);
						mapControls.setCountyHighlightingByID(fipsCode, mapControls.CountyHighlightType.Selected);
						this.updateInfoCardHoverHighlight(fipsCode, false);
					},

					updateInfoCardHoverHighlight(fipsCode, doHover)
					{
						let card = document.getElementById("InfoCard_" + fipsCode);

						if (card !== null)
						{
							if (doHover)
								card.classList.add("Hovered");
							else
								card.classList.remove("Hovered");
						}
					}
				},

			mounted: function() { whenDocumentLoaded(initializeApp); }
		});


	function initializeApp()
	{
		appLogic.data.load(setWaitMessage, doPostDataLoadInitialization);
	} // end initializeApp()


	function doPostDataLoadInitialization()
	{
		mapContainer = document.getElementById("MapContainer");
		svgObject = document.getElementById("SvgObject");
		svgDocument = svgObject.getSVGDocument();

		// Set up map and controls.
		//sizeMapContainer({ width: mapContainer.clientWidth, height: mapContainer.clientHeight });
		mapControls.initializeMapUI(VueApp);

		// Set up page info box display.
		document.getElementById("SourcesAndInfoLink").onclick = showPageInfoBox;
		document.getElementById("PageInfoBoxBackground").onclick = hidePageInfoBox;
		document.getElementById("PageInfoBoxCloseButton").onclick = hidePageInfoBox;
		window.onresize = resizeMapContainer;

		 // Update user message display, then build visualization.
		setWaitMessage(appLogic.AppWaitType.BuildingVisualization);
		setTimeout(buildInitialVisualization, 0);
	} // end doPostDataLoadInitialization()


	function sizeMapContainer(newContainerSize)
	{
		VueApp.mapContainerWidth = newContainerSize.width;
		VueApp.mapContainerHeight = newContainerSize.height;
	}

	function resizeMapContainer()
	{
		let newContainerSize = { width: mapContainer.clientWidth, height: mapContainer.clientHeight };
		sizeMapContainer(newContainerSize);
	} // end resizeMapContainer()


	function buildInitialVisualization()
	{
		VueApp.firstDateNumber = appLogic.data.firstReportedDate;
		VueApp.totalDays = appLogic.data.lastReportedDate - appLogic.data.firstReportedDate + 1;
		VueApp.configBasicFact = appLogic.DefaultFact;
		VueApp.configMeasurement = appLogic.DefaultMeasurementType;
		VueApp.configDataView = appLogic.DefaultDataView;
		VueApp.growthRangeDays = appLogic.DefaultGrowthRangeDays;
		VueApp.populationScale = appLogic.DefaultPopulationScale;
		VueApp.coloration = { unknown: null, zero: null, ranges: [] };

		let animationSequence = setupDataAnimation();
		animationSequence.seek(animationSequence.getStartTime());

		Vue.nextTick(function() { sizeMapContainer({ width: mapContainer.clientWidth, height: mapContainer.clientHeight }); });

		setWaitMessage(appLogic.AppWaitType.None);
	} // end buildInitialVisualization()


	function getMapAnimationTransformations(animationData)
	{
		// Build map transformations

		let transformations = [], coloration = animationData.coloration;
		animationData.counties.forEach(
			county =>
			{
				let target = svgDocument.getElementById("c" + county.id.toString().padStart(appLogic.FIPS_Length, "0"));

				if (target === null)
					return; // There is no map feature corresponding to this county in the data set, so don't build animation transformations for it.

				let countyMapKeyframeTimes = [0],
					countyMapKeyframeValues = [coloration.unknown];
				county.dailyRecords.forEach(
					dailyRecord =>
					{
						const displayFactValue = dailyRecord.displayFactValue;
						const keyFrameTime = (dailyRecord.date - animationData.firstDate + 1) * animationTimeRatio;
						let keyFrameValue = coloration.unknown;

						if (displayFactValue === 0 && coloration.zero !== null)
							keyFrameValue = coloration.zero;
						else if (displayFactValue !== null)
						{
							let colorationRanges = coloration.ranges;
							if (displayFactValue > colorationRanges[colorationRanges.length - 1].dataRange.max)
								keyFrameValue = coloration.exceedsMax;
							else
							{
								for (let i = 0; i < colorationRanges.length; i++)
								{
									let currentRange = colorationRanges[i],
										currentRangeMin = currentRange.dataRange.min,
										currentRangeMax = currentRange.dataRange.max;
									if (currentRangeMin <= displayFactValue && displayFactValue <= currentRangeMax)
									{
										let distance = (displayFactValue - currentRangeMin) / (currentRangeMax - currentRangeMin);
										keyFrameValue = Concert.Calculators.Color(distance, currentRange.colorRange.start, currentRange.colorRange.end);
										break;
									}
								}
							}
						}
						countyMapKeyframeTimes.push(keyFrameTime);
						countyMapKeyframeValues.push(keyFrameValue);
					});
				transformations.push(
					{
						target: target,
						feature: "fill",
						keyframes: { times: countyMapKeyframeTimes, values: countyMapKeyframeValues }
					});
			});
		
		return transformations;
	} // getMapAnimationTransformations

	
	function getSliderAnimationTransformations()
	{
		let totalDays = VueApp.totalDays,
			sliderTimes = [0], sliderPositions = [0];
		for (let i = 1; i <= totalDays; i++)
		{
			sliderTimes.push(i * animationTimeRatio);
			sliderPositions.push(i)
		}

		let transformationSet =
		{
			target: document.getElementById("AnimationSlider"),
			feature: "value",
			applicator: Concert.Applicators.Property,
			calculator: Concert.Calculators.Discrete,
			keyframes: { times: sliderTimes, values: sliderPositions }
		};

		return transformationSet;
	} // end getSliderAnimationTransformations()
	
	
	function getInfoTitleCardAnimationTransformations()
	{
		let firstDateNumber = VueApp.firstDateNumber, totalDays = VueApp.totalDays,
			titleCardTimes = [0], titleCardValues = [null];
		for (let i = 1; i <= totalDays; i++)
		{
			titleCardTimes.push(i * animationTimeRatio);
			titleCardValues.push(firstDateNumber + i - 1);
		}

		let transformationSet = 
		{
			target: VueApp,
			feature: "displayDateNumber",
			applicator: Concert.Applicators.Property,
			calculator: Concert.Calculators.Discrete,
			keyframes: { times: titleCardTimes, values: titleCardValues }
		};

		return transformationSet;
	} // end getInfoTitleCardAnimationTransformations()


	function setupDataAnimation()
	{
		const BtnSeekStart = document.getElementById("BtnSeekStart"),
			BtnStepBack = document.getElementById("BtnStepBack"),
			BtnPlay = document.getElementById("BtnPlay"),
			BtnStepForward = document.getElementById("BtnStepForward"),
			BtnPause = document.getElementById("BtnPause"),
			BtnSeekEnd = document.getElementById("BtnSeekEnd"),
			AnimationSlider = document.getElementById("AnimationSlider"),
			TimelineCoverLeft = document.getElementById("TimelineCoverLeft"),
			TimelineCoverRight = document.getElementById("TimelineCoverRight"),
			InformationPanel = document.getElementById("InformationPanel");

		sequence = new Concert.Sequence();
		sequence.setDefaults(
			{
				applicator: Concert.Applicators.SVG_ElementAttribute,
				calculator: Concert.Calculators.Discrete,
				easing: Concert.EasingFunctions.ConstantRate,
				unit: null
			});
		
		// Build data set used for animating things.
		let animationData =
			appLogic.data.prepareDataForAnimation(
				VueApp.configBasicFact, VueApp.configMeasurement, VueApp.configDataView, VueApp.populationScale, VueApp.growthRangeDays, null);
		VueApp.maxOverallValue = animationData.maxOverallDisplayFactValue;
		VueApp.coloration = animationData.coloration;

		// Set up map animation.
		sequence.addTransformations(getMapAnimationTransformations(animationData));

		// Set up timeline animation.
//		sequence.addTransformations(getTimelineAnimationTransformations());
		
		// Set up slider control animation.
		sequence.addTransformations(getSliderAnimationTransformations());
		
		// Animate info title card.
		sequence.addTransformations(getInfoTitleCardAnimationTransformations());

		// Give all counties with no data the "unknown" color.
		let colorForUnknown = VueApp.coloration.unknown;
		if (colorForUnknown !== null)
		{
			let allCountyPathElements = svgDocument.querySelectorAll("[id^='c']");
			allCountyPathElements.forEach(
				countyPathElement =>
				{
					if (appLogic.data.getCountyByID(countyPathElement.id.substring(1)) === null)
						countyPathElement.style.fill = colorForUnknown;
				});
		}

		// Wire up controls.
		document.getElementById("ConfigPhrase").onclick = showConfigDialog;
		InformationPanel.onclick = informationPanelClick;
		BtnSeekStart.onclick = animationUserSeekStart;
		BtnStepBack.onclick = animationUserStepBack;
		BtnPlay.onclick = animationPlay;
		BtnStepForward.onclick = animationUserStepForward;
		BtnPause.onclick = animationPause;
		BtnSeekEnd.onclick = animationUserSeekEnd;
		AnimationSlider.onkeydown = function(eventObject) { eventObject.preventDefault(); };
		AnimationSlider.oninput = function(eventObject) { animationUserSeekDay(parseInt(eventObject.target.value, 10)); };
		TimelineCoverRight.onclick = timelineClickRight;
		TimelineCoverLeft.onclick = timelineClickLeft;
		document.onkeydown = handleKeyboardControl;
		mapControls.setPagewideKeyDownController(handleKeyboardControl);
		animationEnable();

		return sequence;
	} // end setupDataAnimation()


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

	
	function animationEnable()
	{
		animationEnabled = true;
	} // end animationEnable()


	function animationDisable()
	{
		animationPause();
		animationEnabled = false;
	} // end animationDisable()


	function animationUserSeekStart()
	{
		if (animationEnabled)
			animationUserSeekDay(0);
	} // end animationUserSeekStart()


	function animationUserSeekEnd()
	{
		if (animationEnabled)
			animationUserSeekDay(VueApp.totalDays);
	} // end animationUserSeekEnd()


	function animationUserSeekDay(dayNumber)
	{
		if (animationEnabled)
		{
			animationPause();
			animationInternalSeekDay(dayNumber);
		}
	} // end animationUserSeekDay()


	function animationInternalSeekDay(dayNumber)
	{
		currentAnimationDay = Math.min(Math.max(dayNumber, 0), VueApp.totalDays);
		sequence.seek(currentAnimationDay * animationTimeRatio);
	} // end animationInternalSeekDay()


	function animationUserStepForward()
	{
		if (animationEnabled)
			animationUserSeekDay(Math.round(sequence.getCurrentTime() / animationTimeRatio) + 1);
	} // end animationUserStepForward()


	function animationUserStepBack()
	{
		if (animationEnabled)
			animationUserSeekDay(Math.round(sequence.getCurrentTime() / animationTimeRatio) - 1);
	} // end animationUserStepBack()


	function animationPlay()
	{
		if (animationEnabled)
			animationTimeout = setTimeout(continueAnimation, animationTimeRatio);
	} // end animationSeekStart()


	function continueAnimation()
	{
		if (currentAnimationDay < VueApp.totalDays)
		{
			animationInternalSeekDay(++currentAnimationDay);
			animationTimeout = setTimeout(continueAnimation, animationTimeRatio);
		}
		else
			animationTimeout = null;
	} // end continueAnimation()


	function animationPause()
	{
		if (animationTimeout !== null)
		{
			clearTimeout(animationTimeout);
			animationTimeout = null;
		}
	} // end animationSeekStart()


	function animationIsRunning()
	{
		return (animationTimeout !== null);
	} // end animationIsRunning()


	function animationToggleStartStop()
	{
		if (animationEnabled)
		{
			if (animationIsRunning())
				animationPause();
			else
				animationPlay();
		}
	} // end animationToggleStartStop()


	function getTimelineClickDayPosition(eventObject, invert)
	{
		let boundingRect = eventObject.target.getBoundingClientRect(),
			clickPositionX = eventObject.clientX - boundingRect.left,
			dayPosition = Math.trunc(clickPositionX / TimelineDateBoxWidth) + 1,
			invertedDayPosition = eventObject.target.clientWidth / TimelineDateBoxWidth + 1 - dayPosition;
		return (invert ? invertedDayPosition : dayPosition);
	} // end getTimelineClickDayPosition()


	function timelineClickRight(eventObject)
	{
		if (animationEnabled)
		{
			let AnimationSlider = document.getElementById("AnimationSlider"),
				daysToMove = getTimelineClickDayPosition(eventObject, false),
				sliderValue = parseInt(AnimationSlider.value, 10);
			if (parseInt(AnimationSlider.max, 10) - sliderValue >= daysToMove)
				animationUserSeekDay(sliderValue + daysToMove);
		}
	} // end timelineClickRight()


	function timelineClickLeft(eventObject)
	{
		if (animationEnabled)
		{
			let AnimationSlider = document.getElementById("AnimationSlider"),
				daysToMove = getTimelineClickDayPosition(eventObject, true),
				sliderValue = parseInt(AnimationSlider.value, 10);
			if (sliderValue - parseInt(AnimationSlider.min, 10) >= daysToMove)
				animationUserSeekDay(sliderValue - daysToMove);
		}
	} // end timelineClickLeft()


	function informationPanelClick(eventObject)
	{
		let targetID = eventObject.target.id;
		if (targetID !== null && targetID.length > 14 && targetID.indexOf("BtnRemoveCard_") === 0)
		{
			// A info card removal button was clicked.
			let countyID = targetID.substring(14);
			VueApp.infoCardCountyList = VueApp.infoCardCountyList.filter(countyEntry => (countyEntry.id !== countyID));
			mapControls.setCountyHighlightingByID(countyID, mapControls.CountyHighlightType.Normal);
		}
	} // end informationPanelClick()


	function handleKeyboardControl(eventObject)
	{
		if (animationEnabled)
		{
			let keyCode = eventObject.keyCode;
			if (keyCode === 36 || keyCode === 38) // home key or up arrow
				animationUserSeekStart();
			else if (keyCode === 37) // left arrow
				animationUserStepBack();
			else if (keyCode === 32) // space bar
				animationToggleStartStop();
			else if (keyCode === 39) // right arrow
				animationUserStepForward();
			else if (keyCode === 35 || keyCode === 40) // end key or down arrow
				animationUserSeekEnd();
			else if (keyCode === 107 || keyCode === 61) // plus key
				mapControls.zoomInOneStepCentered();
			else if (keyCode === 109 || keyCode === 173) // minus key
				mapControls.zoomOutOneStepCentered();
			else if (keyCode === 220) // backslash key
				mapControls.zoomFull();
		}
	} // end handleKeyboardControl()


	function showPageInfoBox()
	{
		VueApp.pageInfoBoxDisplay = "block";
	} // end showPageInfoBox()


	function hidePageInfoBox()
	{
		VueApp.pageInfoBoxDisplay = "none";
	} // end hidePageInfoBox()


	function showConfigDialog()
	{
		animationDisable();
		savedConfigValues =
		{
			basicFact: VueApp.configBasicFact,
			measurement: VueApp.configMeasurement,
			dataView: VueApp.configDataView,
			growthRangeDays: VueApp.growthRangeDays,
			populationScale: VueApp.populationScale
		};
		VueApp.configurationBoxDisplay = "block";
		document.getElementById("BtnApplyConfigChanges").onclick = function() { hideConfigDialog(true); };
		document.getElementById("BtnCancelConfigChanges").onclick = function() { hideConfigDialog(false); };
	} // end showConfigDialog()


	function hideConfigDialog(apply)
	{
		if (apply)
		{
			if (VueApp.configurationErrors.length === 0)
			{
				VueApp.configurationBoxDisplay = "none";
				setWaitMessage(appLogic.AppWaitType.BuildingVisualization);
				// Let the display update to indicate processing is underway, then do the processing.
				setTimeout(
					function()
					{
						let animationSequence = setupDataAnimation();
						animationSequence.seek(animationSequence.getStartTime());
						setWaitMessage(appLogic.AppWaitType.None);
					},
					0
				)
			}
		}
		else
		{
			VueApp.configurationBoxDisplay = "none";
			VueApp.configBasicFact = savedConfigValues.basicFact;
			VueApp.configMeasurement = savedConfigValues.measurement;
			VueApp.configDataView = savedConfigValues.dataView;
			VueApp.growthRangeDays = savedConfigValues.growthRangeDays;
			VueApp.populationScale = savedConfigValues.populationScale;
			animationEnable();
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
			else if (waitType === appLogic.AppWaitType.LoadingCaseData)
				VueApp.waitMessage = "Loading County Case Data...";
			else if (waitType === appLogic.AppWaitType.ProcessingCaseData)
				VueApp.waitMessage = "Processing County Case Data...";
			else if (waitType === appLogic.AppWaitType.BuildingVisualization)
				VueApp.waitMessage = "Building Visualization...";
		}
	} // end setWaitMessage()

})(); // end UI singleton definition

export default appUI;
