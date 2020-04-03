const FactType =
{
	Cases: 0,
	CasesPerCapita: 1,
	Deaths: 2,
	DeathsPerCapita: 3,
	DeathsPerCase: 4
};
const DataViewType =
{
	InstantaneousValue: 0,
	GrowthAbsolute: 1,
	GrowthLogarithmicBase: 2
};
//const DefaultFact = FactType.Cases;
//const DefaultDataView = DataViewType.InstantaneousValue;
//const DefaultAnimationRatioMSPerDay = 1000;
//const DefaultColorationHue = 0; // Red
//const DefaultScaleMax = null;


let appLogic = (function()
{
	"use strict";

	const FIPS_LENGTH = 5;


	function parseDate(dateString)
	{
		let pieces = dateString.split("/"),
			parsedDate = new Date(pieces[2], parseInt(pieces[0], 10) - 1, pieces[1]);
		return parsedDate;
	} // end parseDate()


	function buildCountyList(csvText)
	{
		let parsedData =
			Papa.parse(
				csvText,
				{
					header: true,

					transformHeader:
						function(header)
						{
							if(header === "Id2")
								return "fips";
							else
								return "population";
						},

					transform:
						function(value, header)
						{
							if(header === "fips")
								return value.padStart(FIPS_LENGTH, "0");
							else
								return value;
						},
					
					dynamicTyping: header => (header === "population"),

					skipEmptyLines: true
				}).data;
		
		let allCountyData =
			{
				maxCaseCount: 0,
				maxDeaths: 0,
				firstDate: null,
				lastDate: null,
				counties: []
			};
		parsedData.forEach(
			item =>
			{
				allCountyData.counties[parseInt(item.fips, 10)] =
					{
						id: item.fips,
						population: item.population,
						maxCaseCount: 0,
						maxDeaths: 0,
						covid19Records: []
					};
			});

		return allCountyData;
	} // end buildCountyList()


	function storeCountyCaseData(csvText, allCountyData)
	{
		let parsedData = Papa.parse(
			csvText,
			{
				header: true,

				transformHeader: header => ((header === "fips") ? "id" : header),

				transform:
					(value, header) => ((header === "id") ? value.padStart(FIPS_LENGTH, "0") : value),

				dynamicTyping: header => (header === "cases" || header === "deaths"),

				skipEmptyLines: true
			}).data;
		
		parsedData.forEach(
			item =>
			{
				if (item.id !== "00000")
				{
					let intId = parseInt(item.id, 10);
					let currentCounty = allCountyData.counties[intId];

					if (typeof currentCounty === "undefined")
						throw "Error: No such county as " + item.id;
					
					let cases = item.cases, deaths = item.deaths, date = parseDate(item.date);

					if (cases > allCountyData.maxCaseCount)
						allCountyData.maxCaseCount = cases;
					if (deaths > allCountyData.maxDeaths)
						allCountyData.maxDeaths = deaths;
					if (allCountyData.firstDate === null || date < allCountyData.firstDate)
						allCountyData.firstDate = date;
					if (allCountyData.lastDate === null || date > allCountyData.lastDate)
						allCountyData.lastDate = date;
					
					if (cases > currentCounty.maxCaseCount)
						currentCounty.maxCaseCount = cases;
					if (deaths > currentCounty.maxDeaths)
						currentCounty.maxDeaths = deaths;
					currentCounty.covid19Records.push(
						{
							date: date,
							cumulativeCases: item.cases,
							cumulativeDeaths: item.deaths
						});
					}
			});
	} // end storeCountyCaseData()


	let publicInterface =
		{
			buildCountyList: buildCountyList,
			storeCountyCaseData: storeCountyCaseData
		};
	
	return publicInterface;
})(); // end appLogic singleton definition


// let view = // CHANGE CODE HERE
(function()
{
	"use strict";

	const TimelineDateBoxWidth = 90, TimelineStartingOffset = 541;


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
	

	function buildDataAnimation(allCountyData, fact, dataView, animationTimeRatio, colorationHue, exceededRangeColor, scaleMax)
	{
		const msPerDay = 1000 * 60 * 60 * 24;

		if(scaleMax === null)
			scaleMax = allCountyData.maxCaseCount; // CHANGE CODE HERE (this will not always be true)

		let sequence = new Concert.Sequence();
		sequence.setDefaults(
			{
				applicator: Concert.Applicators.SVG_ElementAttribute,
				calculator: Concert.Calculators.Color,
				easing: Concert.EasingFunctions.ConstantRate,
				unit: null
			});
		
		allCountyData.counties.forEach(
			county =>
			{
				let mapElement = document.getElementById("SvgObject").getSVGDocument().getElementById("c" + county.id);

				if (mapElement !== null)
				{
					let keyframeTimes = [0],
					keyFrameValues = ["hsl(" + colorationHue + ", 100%, 100%)"];
				
					county.covid19Records.forEach(
						(covid19Record /*, index, covid19Records*/) =>
						{
							let keyFrameTime = Math.round(((covid19Record.date - allCountyData.firstDate) / msPerDay + 1) * animationTimeRatio);
							let keyFrameValue;

							//let lastFactValue;
							let currentFactValue;
							if (fact === FactType.Cases)
							{
								//lastFactValue = (index < 1) ? 0 : covid19Records[index - 1].cumulativeCases;
								currentFactValue = covid19Record.cumulativeCases;
							}
							else if (fact === FactType.CasesPerCapita)
							{
								// ADD CODE HERE
							}
							else if (fact === FactType.Deaths)
							{
								// ADD CODE HERE
							}
							else if (fact === FactType.DeathsPerCapita)
							{
								// ADD CODE HERE
							}
							else if (fact === FactType.DeathsPerCase)
							{
								// ADD CODE HERE
							}
							else
								throw "Invalid fact parameter";
							
							if (dataView === DataViewType.InstantaneousValue)
							{
								if (currentFactValue <= scaleMax)
									keyFrameValue = Concert.Calculators.Color(currentFactValue / scaleMax, keyFrameValues[0], "hsl(" + colorationHue + ", 100%, 50%)");
								else
									keyFrameValue = exceededRangeColor; // ADD CODE HERE: need to deal with making the shift to this discrete instead of gradual
							}
							else if (dataView === DataViewType.GrowthAbsolute)
							{
								// ADD CODE HERE
							}
							else if (dataView === DataViewType.GrowthLogarithmicBase)
							{
								// ADD CODE HERE
							}

							keyframeTimes.push(keyFrameTime);
							keyFrameValues.push(keyFrameValue);
						});
				
					if (document.getElementById("SvgObject").getSVGDocument().getElementById("c" + county.id) === null)
						alert("null target");

					sequence.addTransformations(
						{
							target: mapElement,
							feature: "fill",
							keyframes: { times: keyframeTimes, values: keyFrameValues }
						});
				}
			}); // end forEach on allCountyData.counties

		let totalDays = Math.round((allCountyData.lastDate - allCountyData.firstDate) / msPerDay);
		sequence.addTransformations(
			{
				target: document.getElementById("Timeline"),
				feature: "margin-left",
				applicator: Concert.Applicators.Style,
				calculator: Concert.Calculators.Linear,
				unit: "px",
				keyframes:
					{
						times: [0, totalDays * animationTimeRatio],
						values: [TimelineStartingOffset, TimelineStartingOffset - totalDays * TimelineDateBoxWidth]
					}
			});
		sequence.addTransformations(
			{
				target: document.getElementById("AnimationSlider"),
				feature: "value",
				applicator: Concert.Applicators.Property,
				calculator: Concert.Calculators.Linear,
				calculatorModifiers: { roundFactor: 1 },
				keyframes:
					{
						times: [0, totalDays * animationTimeRatio],
						values: [0, totalDays]
					}
			});
		
		document.getElementById("BtnPlay").onclick = function() { sequence.run(); };
		/*
		let cook = allCountyData.c17031, dailyCaseRecords = cook.dailyCaseRecords;
		let times = [0], values = ["hsl(" + colorationHue + ", 100%, 100%)"];
		for(let i = 0; i < dailyCaseRecords.length; i++)
		{
			times.push(i * animationTimeRatio);

			let currentValue = dailyCaseRecords[i].cumulativeCases;
			if(currentValue <= scaleMax)
			{
				let currentColor = Concert.Calculators.Color(currentValue / scaleMax, values[0], "hsl(" + colorationHue + ", 100%, 50%)");
				values.push(currentColor);
			}
			else
				values.push(exceededRangeColor);
		}
		sequence.addTransformations(
			{
				target: document.getElementById("SvgObject").getSVGDocument().getElementById("c17031"),
				feature: "fill",
				keyframes: { times: times, values: values }
			});
		*/
		return sequence;
	} // end buildDataAnimation()


	function buildTimelineData(firstDate, lastDate, vueAppObject)
	{
		let currentDate = firstDate;
		while (currentDate < lastDate)
		{
			let month = currentDate.toLocaleString("en-us", { month: "long" }),
				dayOfMonth = currentDate.getDate();

			vueAppObject.dateList.push({ month: month, dayOfMonth: dayOfMonth });
			let nextDate = new Date(currentDate);
			nextDate.setDate(nextDate.getDate() + 1);
			currentDate = nextDate;
		}
	} // end buildTimelineData()


	let VueApp = new Vue(
		{
			el: "#Everything",
	
			data:
				{
					waitMessage: "Loading Map...",
					waitMessageDisplay: "block",
					allCountyData: null,
					displayDate: "",
					dateList: []
				},
	
			mounted: function()
			{
				let runSetup =
					(function(vueObject)
					{
						let setupFunction =
							function()
							{
								vueObject.waitMessage = "Loading County Population Data...";
								fetch("data/countyPopulations2018.csv")
									.then(
										response =>
										{
											vueObject.waitMessage = "Processing County Population Data...";
											return response.text();
										})
									.then(
										text =>
										{
											vueObject.allCountyData = appLogic.buildCountyList(text);
											vueObject.waitMessage = "Loading County Case Data...";
											return fetch("data/countyCases.csv");
										})
									.then(
										response =>
										{
											vueObject.waitMessage = "Processing County Case Data...";
											return response.text();
										})
									.then(
										text =>
										{
											let allCountyData = vueObject.allCountyData;
											appLogic.storeCountyCaseData(text, allCountyData);
											buildTimelineData(allCountyData.firstDate, allCountyData.lastDate, vueObject);
					
											// CHANGE CODE: coloration test
											window.allCountyData = allCountyData;
											window.sequence = buildDataAnimation(
												allCountyData,
												FactType.Cases,
												DataViewType.InstantaneousValue,
												200, 0, "hsl(50, 100%, 50%)", 100);
					
											vueObject.waitMessageDisplay = "none";
										});
							};
						return setupFunction;
					})(this);
				whenDocumentLoaded(runSetup);
			}
		});

	// CHANGE CODE HERE: remove the below if there turns out to be no need for a public interface
	let publicInterface =
		{
			FactType: FactType,
			DataViewType: DataViewType,

			whenDocumentLoaded: whenDocumentLoaded,
			buildDataAnimation: buildDataAnimation,
			VueApp: VueApp
		};
	return publicInterface;
})(); // end view singleton definition
