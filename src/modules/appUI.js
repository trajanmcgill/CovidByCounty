import appLogic from "./appLogic.js?ver=2";
import mapControls from "./mapControls.js?ver=2";
import Vue from "./vue.js?ver=2";
import {Concert} from "./Concert.js?ver=2";

const msPerDay = 1000 * 60 * 60 * 24;

let appUI = (function()
{
	const TimelineDateBoxWidth = 90, TimelineStartingOffset = 541;
	const DefaultSingleValueColors =
		{
			Unknown: "rgb(80, 80, 80)",
			Zero: "rgb(128, 128, 128)",
			ExceedsMax: "rgb(0, 0, 255)"
		};
	const DefaultColorGradients =
		{
			negative:
				[
					{ start: "rgb(0, 255, 0)", end: "rgb(0, 255, 255)" }
				],
			positive: 
				[
					{ start: "rgb(255, 255, 255)", end: "rgb(255, 255, 0)" },
					{ start: "rgb(255, 255, 0)", end: "rgb(255, 0, 0)" },
					{ start: "rgb(255, 0, 0)", end: "rgb(77, 0, 153)" }
				]
		};
	const DefaultAnimationTimeRatio = 500;

	let svgObject = null, svgDocument = null;
	let animationTimeRatio = DefaultAnimationTimeRatio;
	let totalDays = 0;
	let sequence = null;
	let animationEnabled = false;
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
					displayDate: null,
					dateList: [],
					mapConfigPhrase: "",
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
					infoCardCountyList: [],
					consoleEntries: [] // REMOVE CODE HERE
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

					infoCards:
						function()
						{
							let cards = [];
							this.infoCardCountyList.forEach(
								countyCard =>
								{
									let county = appLogic.data.getCountyByID(countyCard.id),
										matchingRecordIndex, currentDailyRecord, previousDailyRecord;
									if (this.displayDate === null)
										currentDailyRecord = previousDailyRecord = { cumulativeCases : 0, cumulativeDeaths: 0 };
									else
									{
										matchingRecordIndex = county.covid19Records.findIndex(record => dateComparison(record.date, this.displayDate, 0));
										currentDailyRecord = (matchingRecordIndex >= 0) ? county.covid19Records[matchingRecordIndex] : { cumulativeCases : 0, cumulativeDeaths: 0 };

										matchingRecordIndex = county.covid19Records.findIndex(record => dateComparison(record.date, this.displayDate, this.growthRangeDays));
										previousDailyRecord = (matchingRecordIndex >= 0) ? county.covid19Records[matchingRecordIndex] : { cumulativeCases : 0, cumulativeDeaths: 0 };
									}
									let currentCases = currentDailyRecord.cumulativeCases,
										previousCases = previousDailyRecord.cumulativeCases,
										casesAbsoluteChange = currentCases - previousCases,
										casesByPopulation = currentCases / county.population * this.populationScale,
										casesByPopulationChange = casesByPopulation - previousCases / county.population * this.populationScale,
										casesChangePercentage = (casesAbsoluteChange === 0) ? 0 : ((previousCases === 0) ? Number.POSITIVE_INFINITY : 100 * casesAbsoluteChange / previousCases),
										currentDeaths = currentDailyRecord.cumulativeDeaths,
										previousDeaths = previousDailyRecord.cumulativeDeaths,
										deathsAbsoluteChange = currentDeaths - previousDeaths,
										deathsChangePercentage = (deathsAbsoluteChange === 0) ? 0 : ((previousDeaths === 0) ? Number.POSITIVE_INFINITY : 100 * deathsAbsoluteChange / previousDeaths),
										deathsByPopulation = currentDeaths / county.population * this.populationScale,
										deathsByPopulationChange = deathsByPopulation - previousDeaths / county.population * this.populationScale,
										deathsPerCase = (currentDeaths === 0) ? 0 : currentDeaths / currentCases,
										previousDeathsPerCase = (previousDeaths === 0) ? 0 : previousDeaths / previousCases,
										deathsPerCaseChange = deathsPerCase - previousDeathsPerCase,
										deathsPerCaseChangePercentage = (deathsPerCaseChange === 0) ? 0 : ((previousDeathsPerCase === 0) ? Number.POSITIVE_INFINITY : 100 * deathsPerCaseChange / previousDeathsPerCase);
									cards.push(
										{
											id: countyCard.id,
											placeName: countyCard.placeName,
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
											deathsPerCaseChangePercentage: deathsPerCaseChangePercentage
										});
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
						}
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
		appLogic.loadData(
			setWaitMessage,
			function()
			{
				svgObject = document.getElementById("SvgObject");
				svgDocument = svgObject.getSVGDocument();
				mapControls.initializeMapUI(VueApp);
				buildTimelineViewData(appLogic.data.firstReportedDate, appLogic.data.lastReportedDate);
				setWaitMessage(appLogic.AppWaitType.BuildingVisualization);
				let animationSequence = setupDataAnimation(
					appLogic.DefaultFact, appLogic.DefaultMeasurementType, appLogic.DefaultDataView,
					appLogic.DefaultGrowthRangeDays, appLogic.DefaultPopulationScale, null);
				animationSequence.seek(animationSequence.getStartTime());
				setWaitMessage(appLogic.AppWaitType.None);

				window.appLogic = appLogic; // REMOVE CODE HERE
			});
	} // end initializeApp()


	function buildRawMapAnimationData(basicFact, measurement, dataView, populationScale, growthRangeDays)
	{
		let rawAnimationData =
		{
			minValueGreaterThanZero: null,
			maxOverallDisplayFactValue: 0,
			firstDate: appLogic.data.firstReportedDate,
			counties: []
		};

		appLogic.data.counties.forEach(
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

						if (currentCountyData.vueInfoCard != null)
						{
							currentCountyData.infoCardDailyRecords.push(
								{
									date: covid19Record.date,
									casesAbsolute: currentCases,
									casesByPopulation: currentCases / countyPopulation * populationScale,
									deathsAbsolute: currentDeaths,
									deathsByPopulation: currentDeaths / countyPopulation * populationScale,
									deathsPerCase: currentDeaths / currentCases
								});
						}

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
							{
								let valueChange = currentMeasuredValue - previousMeasuredValue;
								displayFactValue = (valueChange === 0) ? 0 : ((previousMeasuredValue === 0) ? Number.POSITIVE_INFINITY : valueChange / previousMeasuredValue);
							}
							else
								throw "Invalid data view parameter";
							
							if (displayFactValue > 0 && (rawAnimationData.minValueGreaterThanZero === null || displayFactValue < rawAnimationData.minValueGreaterThanZero))
								rawAnimationData.minValueGreaterThanZero = displayFactValue;
							if (displayFactValue > rawAnimationData.maxOverallDisplayFactValue && displayFactValue !== Number.POSITIVE_INFINITY)
								rawAnimationData.maxOverallDisplayFactValue = displayFactValue;
						}
						
						currentCountyData.dailyRecords.push({ date: covid19Record.date, displayFactValue: displayFactValue });
					}); // end forEach on county.covid19Records
				
				rawAnimationData.counties.push(currentCountyData);
			}); // end forEach on counties
		
		return rawAnimationData;
	} // end buildRawMapAnimationData()


	function getMapAnimationTransformations(rawAnimationData, coloration)
	{
		let transformations = [];
		
		rawAnimationData.counties.forEach(
			county =>
			{
				// Build map transformations
				let countyMapKeyframeTimes = [0],
					countyMapKeyframeValues = [coloration.unknown];
				county.dailyRecords.forEach(
					dailyRecord =>
					{
						let displayFactValue = dailyRecord.displayFactValue;
						let keyFrameTime = Math.round(((dailyRecord.date - rawAnimationData.firstDate) / msPerDay + 1) * animationTimeRatio); // CHANGE CODE HERE
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
						target: svgDocument.getElementById("c" + county.id),
						feature: "fill",
						keyframes: { times: countyMapKeyframeTimes, values: countyMapKeyframeValues }
					});
			});
		
		return transformations;
	} // getMapAnimationTransformations


	function buildColoration_Percentages(minValueGreaterThanZero, maxValue)
	{
		let coloration = buildColoration_Positive(minValueGreaterThanZero, maxValue);
		coloration.zero = null;
		coloration.ranges.unshift(
			{
				dataRange: { min: -1, max: 0 },
				colorRange: DefaultColorGradients.negative[0]
			});

		return coloration;
	} // end buildColoration_Percentages()


	function buildColoration_Positive(minValueGreaterThanZero, maxValue)
	{
		let dataRanges;
		if (minValueGreaterThanZero)
		{
			let maxMinRatio = maxValue / minValueGreaterThanZero;
			if (maxMinRatio > 10000)
			{
				let base = Math.cbrt(maxValue),
					secondPower = Math.pow(base, 2);
				dataRanges =
					[
						{ min: 0, max: base },
						{ min: base, max: secondPower },
						{ min: secondPower, max: maxValue }
					];
			}
			else if (maxMinRatio > 100)
			{
				let base = Math.sqrt(maxValue);
				dataRanges =
					[
						{ min: 0, max: base },
						{ min: base, max: maxValue }
					];
			}
			else
				dataRanges = [ { min: 0, max: maxValue }];
		}
		else
			dataRanges = [];
		
		let coloration =
			{
				zero: DefaultSingleValueColors.Zero,
				unknown: DefaultSingleValueColors.Unknown,
				exceedsMax: DefaultSingleValueColors.ExceedsMax,
				ranges: []
			};
		dataRanges.forEach(
			(dataRange, index) =>
			{
				coloration.ranges.push(
					{
						dataRange: dataRange,
						colorRange: DefaultColorGradients.positive[index]
					});
			});

		return coloration;
	} // end buildColoration_Positive()


	function setupDataAnimation(basicFact, measurement, dataView, growthRangeDays, populationScale, coloration)
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
		
		// Animate map
		let rawMapAnimationData = buildRawMapAnimationData(basicFact, measurement, dataView, populationScale, growthRangeDays);
		if (coloration === null)
		{
			if (basicFact === appLogic.BasicFactType.Deaths && measurement === appLogic.MeasurementType.CaseRelative && dataView === appLogic.DataViewType.ChangeProportional)
				coloration = buildColoration_Percentages(rawMapAnimationData.minValueGreaterThanZero, rawMapAnimationData.maxOverallDisplayFactValue);
			else
				coloration = buildColoration_Positive(rawMapAnimationData.minValueGreaterThanZero, rawMapAnimationData.maxOverallDisplayFactValue);
		}
		let mapTransformations = getMapAnimationTransformations(rawMapAnimationData, coloration);
		mapTransformations.forEach(transformation => { sequence.addTransformations(transformation); });
		let mapConfigPhrase;
		if (basicFact === appLogic.BasicFactType.Cases)
			mapConfigPhrase = "Cumulative Cases";
		else if (basicFact === appLogic.BasicFactType.Deaths)
			mapConfigPhrase = "Cumulative Deaths";
		if (measurement === appLogic.MeasurementType.Absolute)
			mapConfigPhrase += " (Total)";
		else if (measurement === appLogic.MeasurementType.CaseRelative)
			mapConfigPhrase += " per Case [fatality rate]";
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
		VueApp.coloration = coloration;

		// Animate timeline
		totalDays = appLogic.countUniqueDays(appLogic.data.firstReportedDate, appLogic.data.lastReportedDate);
		let timelineTimes = [0], timelinePositions = [TimelineStartingOffset];
		for (let i = 0; i < totalDays; i++)
		{
			let nextLandingTime = (i + 1) * animationTimeRatio;

			timelineTimes.push(nextLandingTime);
			timelinePositions.push(TimelineStartingOffset - (i + 1) * TimelineDateBoxWidth);
		}
		sequence.addTransformations(
			{
				target: document.getElementById("Timeline"),
				feature: "margin-left",
				applicator: Concert.Applicators.Style,
				calculator: Concert.Calculators.Discrete,
				easing: Concert.EasingFunctions.ConstantRate,
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
		
		// Animate info title card
		let titleCardTimes = [0], titleCardValues = [null];
		for (let i = 1; i <= totalDays; i++)
		{
			titleCardTimes.push(i * animationTimeRatio);
			titleCardValues.push(VueApp.dateList[i - 1]);
		}
		sequence.addTransformations(
			{
				target: VueApp,
				feature: "displayDate",
				applicator: Concert.Applicators.Property,
				calculator: Concert.Calculators.Discrete,
				keyframes: { times: titleCardTimes, values: titleCardValues }
			});
		
		document.getElementById("ConfigPhrase").onclick = showConfigDialog;
		InformationPanel.onclick = informationPanelClick;
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
		document.onkeydown = handleKeyboardControl;
		mapControls.setPagewideKeyDownController(handleKeyboardControl);
		animationEnable();

		return sequence;
	} // end setupDataAnimation()


	function buildTimelineViewData(firstDate, lastDate)
	{
		let currentDate = firstDate;
		while (currentDate <= lastDate)
		{
			VueApp.dateList.push(currentDate);
			let nextDate = new Date(currentDate);
			nextDate.setDate(nextDate.getDate() + 1);
			currentDate = nextDate;
		}
	} // end buildTimelineData()


	function dateComparison(firstDate, secondDate, targetedDifference)
	{
		let adjustedDate = new Date(firstDate);
		adjustedDate.setDate(adjustedDate.getDate() + targetedDifference);
		let match =
			(adjustedDate.getFullYear() === secondDate.getFullYear()
			&& adjustedDate.getMonth() === secondDate.getMonth()
			&& adjustedDate.getDate() === secondDate.getDate());
		return match;
	} // end dateComparison()


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
		if (sequence !== null)
			sequence.stop();

		animationEnabled = false;
	} // end animationDisable()


	function animationSeekStart()
	{
		if (animationEnabled)
			animationSeekToSpecificDay(0);
	}


	function animationStepBack()
	{
		if (animationEnabled)
			animationSeekToSpecificDay(Math.max(Math.round(sequence.getCurrentTime() / animationTimeRatio) - 1, 0));
	}


	function animationPlay()
	{
		if (animationEnabled)
			sequence.run();
	}


	function animationStepForward()
	{
		if (animationEnabled)
			animationSeekToSpecificDay(Math.min(Math.round(sequence.getCurrentTime() / animationTimeRatio) + 1, totalDays));
	}


	function animationPause()
	{
		if (sequence !== null)
			sequence.stop();
	}


	function animationSeekEnd()
	{
		if (animationEnabled)
			animationSeekToSpecificDay(totalDays);
	}


	function animationSeekToSpecificDay(dayNumber)
	{
		if (animationEnabled)
		{
			sequence.stop();
			sequence.seek(Math.min(Math.max(dayNumber, 0), totalDays) * animationTimeRatio);
		}
	}


	function animationToggleStartStop()
	{
		if (animationEnabled)
		{
			if (sequence.isRunning())
				animationPause();
			else
				animationPlay();
		}
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
		if (animationEnabled)
		{
			let AnimationSlider = document.getElementById("AnimationSlider"),
				daysToMove = getTimelineClickDayPosition(eventObject, false),
				sliderValue = parseInt(AnimationSlider.value, 10);
			if (parseInt(AnimationSlider.max, 10) - sliderValue >= daysToMove)
				animationSeekToSpecificDay(sliderValue + daysToMove);
		}
	}


	function timelineClickLeft(eventObject)
	{
		if (animationEnabled)
		{
			let AnimationSlider = document.getElementById("AnimationSlider"),
				daysToMove = getTimelineClickDayPosition(eventObject, true),
				sliderValue = parseInt(AnimationSlider.value, 10);
			if (sliderValue - parseInt(AnimationSlider.min, 10) >= daysToMove)
				animationSeekToSpecificDay(sliderValue - daysToMove);
		}
	}

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
	}

	function handleKeyboardControl(eventObject)
	{
		if (animationEnabled)
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
			else if (keyCode === 107 || keyCode === 61) // plus key
				mapControls.zoomInOneStep();
			else if (keyCode === 109 || keyCode === 173) // minus key
				mapControls.zoomOutOneStep();
			else if (keyCode === 220) // backslash key
				mapControls.zoomFull();
		}
	} // end handleKeyboardControl()


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
				let animationSequence = setupDataAnimation(
					VueApp.configBasicFact, VueApp.configMeasurement, VueApp.configDataView,
					VueApp.growthRangeDays, VueApp.populationScale, null);
				animationSequence.seek(animationSequence.getStartTime());
				setWaitMessage(appLogic.AppWaitType.None);
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
