/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 19800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 19800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 878.0, "minX": 0.0, "maxY": 2688.0, "series": [{"data": [[0.0, 878.0], [0.1, 878.0], [0.2, 878.0], [0.3, 878.0], [0.4, 878.0], [0.5, 878.0], [0.6, 878.0], [0.7, 878.0], [0.8, 878.0], [0.9, 878.0], [1.0, 879.0], [1.1, 879.0], [1.2, 879.0], [1.3, 879.0], [1.4, 879.0], [1.5, 879.0], [1.6, 879.0], [1.7, 879.0], [1.8, 879.0], [1.9, 879.0], [2.0, 939.0], [2.1, 939.0], [2.2, 939.0], [2.3, 939.0], [2.4, 939.0], [2.5, 939.0], [2.6, 939.0], [2.7, 939.0], [2.8, 939.0], [2.9, 939.0], [3.0, 964.0], [3.1, 964.0], [3.2, 964.0], [3.3, 964.0], [3.4, 964.0], [3.5, 964.0], [3.6, 964.0], [3.7, 964.0], [3.8, 964.0], [3.9, 964.0], [4.0, 969.0], [4.1, 969.0], [4.2, 969.0], [4.3, 969.0], [4.4, 969.0], [4.5, 969.0], [4.6, 969.0], [4.7, 969.0], [4.8, 969.0], [4.9, 969.0], [5.0, 1132.0], [5.1, 1132.0], [5.2, 1132.0], [5.3, 1132.0], [5.4, 1132.0], [5.5, 1132.0], [5.6, 1132.0], [5.7, 1132.0], [5.8, 1132.0], [5.9, 1132.0], [6.0, 1135.0], [6.1, 1135.0], [6.2, 1135.0], [6.3, 1135.0], [6.4, 1135.0], [6.5, 1135.0], [6.6, 1135.0], [6.7, 1135.0], [6.8, 1135.0], [6.9, 1135.0], [7.0, 1150.0], [7.1, 1150.0], [7.2, 1150.0], [7.3, 1150.0], [7.4, 1150.0], [7.5, 1150.0], [7.6, 1150.0], [7.7, 1150.0], [7.8, 1150.0], [7.9, 1150.0], [8.0, 1157.0], [8.1, 1157.0], [8.2, 1157.0], [8.3, 1157.0], [8.4, 1157.0], [8.5, 1157.0], [8.6, 1157.0], [8.7, 1157.0], [8.8, 1157.0], [8.9, 1157.0], [9.0, 1214.0], [9.1, 1214.0], [9.2, 1214.0], [9.3, 1214.0], [9.4, 1214.0], [9.5, 1214.0], [9.6, 1214.0], [9.7, 1214.0], [9.8, 1214.0], [9.9, 1214.0], [10.0, 1253.0], [10.1, 1253.0], [10.2, 1253.0], [10.3, 1253.0], [10.4, 1253.0], [10.5, 1253.0], [10.6, 1253.0], [10.7, 1253.0], [10.8, 1253.0], [10.9, 1253.0], [11.0, 1261.0], [11.1, 1261.0], [11.2, 1261.0], [11.3, 1261.0], [11.4, 1261.0], [11.5, 1261.0], [11.6, 1261.0], [11.7, 1261.0], [11.8, 1261.0], [11.9, 1261.0], [12.0, 1268.0], [12.1, 1268.0], [12.2, 1268.0], [12.3, 1268.0], [12.4, 1268.0], [12.5, 1268.0], [12.6, 1268.0], [12.7, 1268.0], [12.8, 1268.0], [12.9, 1268.0], [13.0, 1275.0], [13.1, 1275.0], [13.2, 1275.0], [13.3, 1275.0], [13.4, 1275.0], [13.5, 1275.0], [13.6, 1275.0], [13.7, 1275.0], [13.8, 1275.0], [13.9, 1275.0], [14.0, 1293.0], [14.1, 1293.0], [14.2, 1293.0], [14.3, 1293.0], [14.4, 1293.0], [14.5, 1293.0], [14.6, 1293.0], [14.7, 1293.0], [14.8, 1293.0], [14.9, 1293.0], [15.0, 1298.0], [15.1, 1298.0], [15.2, 1298.0], [15.3, 1298.0], [15.4, 1298.0], [15.5, 1298.0], [15.6, 1298.0], [15.7, 1298.0], [15.8, 1298.0], [15.9, 1298.0], [16.0, 1299.0], [16.1, 1299.0], [16.2, 1299.0], [16.3, 1299.0], [16.4, 1299.0], [16.5, 1299.0], [16.6, 1299.0], [16.7, 1299.0], [16.8, 1299.0], [16.9, 1299.0], [17.0, 1346.0], [17.1, 1346.0], [17.2, 1346.0], [17.3, 1346.0], [17.4, 1346.0], [17.5, 1346.0], [17.6, 1346.0], [17.7, 1346.0], [17.8, 1346.0], [17.9, 1346.0], [18.0, 1377.0], [18.1, 1377.0], [18.2, 1377.0], [18.3, 1377.0], [18.4, 1377.0], [18.5, 1377.0], [18.6, 1377.0], [18.7, 1377.0], [18.8, 1377.0], [18.9, 1377.0], [19.0, 1408.0], [19.1, 1408.0], [19.2, 1408.0], [19.3, 1408.0], [19.4, 1408.0], [19.5, 1408.0], [19.6, 1408.0], [19.7, 1408.0], [19.8, 1408.0], [19.9, 1408.0], [20.0, 1418.0], [20.1, 1418.0], [20.2, 1418.0], [20.3, 1418.0], [20.4, 1418.0], [20.5, 1418.0], [20.6, 1418.0], [20.7, 1418.0], [20.8, 1418.0], [20.9, 1418.0], [21.0, 1428.0], [21.1, 1428.0], [21.2, 1428.0], [21.3, 1428.0], [21.4, 1428.0], [21.5, 1428.0], [21.6, 1428.0], [21.7, 1428.0], [21.8, 1428.0], [21.9, 1428.0], [22.0, 1466.0], [22.1, 1466.0], [22.2, 1466.0], [22.3, 1466.0], [22.4, 1466.0], [22.5, 1466.0], [22.6, 1466.0], [22.7, 1466.0], [22.8, 1466.0], [22.9, 1466.0], [23.0, 1469.0], [23.1, 1469.0], [23.2, 1469.0], [23.3, 1469.0], [23.4, 1469.0], [23.5, 1469.0], [23.6, 1469.0], [23.7, 1469.0], [23.8, 1469.0], [23.9, 1469.0], [24.0, 1487.0], [24.1, 1487.0], [24.2, 1487.0], [24.3, 1487.0], [24.4, 1487.0], [24.5, 1487.0], [24.6, 1487.0], [24.7, 1487.0], [24.8, 1487.0], [24.9, 1487.0], [25.0, 1492.0], [25.1, 1492.0], [25.2, 1492.0], [25.3, 1492.0], [25.4, 1492.0], [25.5, 1492.0], [25.6, 1492.0], [25.7, 1492.0], [25.8, 1492.0], [25.9, 1492.0], [26.0, 1514.0], [26.1, 1514.0], [26.2, 1514.0], [26.3, 1514.0], [26.4, 1514.0], [26.5, 1514.0], [26.6, 1514.0], [26.7, 1514.0], [26.8, 1514.0], [26.9, 1514.0], [27.0, 1558.0], [27.1, 1558.0], [27.2, 1558.0], [27.3, 1558.0], [27.4, 1558.0], [27.5, 1558.0], [27.6, 1558.0], [27.7, 1558.0], [27.8, 1558.0], [27.9, 1558.0], [28.0, 1565.0], [28.1, 1565.0], [28.2, 1565.0], [28.3, 1565.0], [28.4, 1565.0], [28.5, 1565.0], [28.6, 1565.0], [28.7, 1565.0], [28.8, 1565.0], [28.9, 1565.0], [29.0, 1590.0], [29.1, 1590.0], [29.2, 1590.0], [29.3, 1590.0], [29.4, 1590.0], [29.5, 1590.0], [29.6, 1590.0], [29.7, 1590.0], [29.8, 1590.0], [29.9, 1590.0], [30.0, 1594.0], [30.1, 1594.0], [30.2, 1594.0], [30.3, 1594.0], [30.4, 1594.0], [30.5, 1594.0], [30.6, 1594.0], [30.7, 1594.0], [30.8, 1594.0], [30.9, 1594.0], [31.0, 1629.0], [31.1, 1629.0], [31.2, 1629.0], [31.3, 1629.0], [31.4, 1629.0], [31.5, 1629.0], [31.6, 1629.0], [31.7, 1629.0], [31.8, 1629.0], [31.9, 1629.0], [32.0, 1637.0], [32.1, 1637.0], [32.2, 1637.0], [32.3, 1637.0], [32.4, 1637.0], [32.5, 1637.0], [32.6, 1637.0], [32.7, 1637.0], [32.8, 1637.0], [32.9, 1637.0], [33.0, 1645.0], [33.1, 1645.0], [33.2, 1645.0], [33.3, 1645.0], [33.4, 1645.0], [33.5, 1645.0], [33.6, 1645.0], [33.7, 1645.0], [33.8, 1645.0], [33.9, 1645.0], [34.0, 1658.0], [34.1, 1658.0], [34.2, 1658.0], [34.3, 1658.0], [34.4, 1658.0], [34.5, 1658.0], [34.6, 1658.0], [34.7, 1658.0], [34.8, 1658.0], [34.9, 1658.0], [35.0, 1690.0], [35.1, 1690.0], [35.2, 1690.0], [35.3, 1690.0], [35.4, 1690.0], [35.5, 1690.0], [35.6, 1690.0], [35.7, 1690.0], [35.8, 1690.0], [35.9, 1690.0], [36.0, 1692.0], [36.1, 1692.0], [36.2, 1692.0], [36.3, 1692.0], [36.4, 1692.0], [36.5, 1692.0], [36.6, 1692.0], [36.7, 1692.0], [36.8, 1692.0], [36.9, 1692.0], [37.0, 1715.0], [37.1, 1715.0], [37.2, 1715.0], [37.3, 1715.0], [37.4, 1715.0], [37.5, 1715.0], [37.6, 1715.0], [37.7, 1715.0], [37.8, 1715.0], [37.9, 1715.0], [38.0, 1749.0], [38.1, 1749.0], [38.2, 1749.0], [38.3, 1749.0], [38.4, 1749.0], [38.5, 1749.0], [38.6, 1749.0], [38.7, 1749.0], [38.8, 1749.0], [38.9, 1749.0], [39.0, 1769.0], [39.1, 1769.0], [39.2, 1769.0], [39.3, 1769.0], [39.4, 1769.0], [39.5, 1769.0], [39.6, 1769.0], [39.7, 1769.0], [39.8, 1769.0], [39.9, 1769.0], [40.0, 1801.0], [40.1, 1801.0], [40.2, 1801.0], [40.3, 1801.0], [40.4, 1801.0], [40.5, 1801.0], [40.6, 1801.0], [40.7, 1801.0], [40.8, 1801.0], [40.9, 1801.0], [41.0, 1832.0], [41.1, 1832.0], [41.2, 1832.0], [41.3, 1832.0], [41.4, 1832.0], [41.5, 1832.0], [41.6, 1832.0], [41.7, 1832.0], [41.8, 1832.0], [41.9, 1832.0], [42.0, 1835.0], [42.1, 1835.0], [42.2, 1835.0], [42.3, 1835.0], [42.4, 1835.0], [42.5, 1835.0], [42.6, 1835.0], [42.7, 1835.0], [42.8, 1835.0], [42.9, 1835.0], [43.0, 1839.0], [43.1, 1839.0], [43.2, 1839.0], [43.3, 1839.0], [43.4, 1839.0], [43.5, 1839.0], [43.6, 1839.0], [43.7, 1839.0], [43.8, 1839.0], [43.9, 1839.0], [44.0, 1850.0], [44.1, 1850.0], [44.2, 1850.0], [44.3, 1850.0], [44.4, 1850.0], [44.5, 1850.0], [44.6, 1850.0], [44.7, 1850.0], [44.8, 1850.0], [44.9, 1850.0], [45.0, 1856.0], [45.1, 1856.0], [45.2, 1856.0], [45.3, 1856.0], [45.4, 1856.0], [45.5, 1856.0], [45.6, 1856.0], [45.7, 1856.0], [45.8, 1856.0], [45.9, 1856.0], [46.0, 1866.0], [46.1, 1866.0], [46.2, 1866.0], [46.3, 1866.0], [46.4, 1866.0], [46.5, 1866.0], [46.6, 1866.0], [46.7, 1866.0], [46.8, 1866.0], [46.9, 1866.0], [47.0, 1878.0], [47.1, 1878.0], [47.2, 1878.0], [47.3, 1878.0], [47.4, 1878.0], [47.5, 1878.0], [47.6, 1878.0], [47.7, 1878.0], [47.8, 1878.0], [47.9, 1878.0], [48.0, 1917.0], [48.1, 1917.0], [48.2, 1917.0], [48.3, 1917.0], [48.4, 1917.0], [48.5, 1917.0], [48.6, 1917.0], [48.7, 1917.0], [48.8, 1917.0], [48.9, 1917.0], [49.0, 1948.0], [49.1, 1948.0], [49.2, 1948.0], [49.3, 1948.0], [49.4, 1948.0], [49.5, 1948.0], [49.6, 1948.0], [49.7, 1948.0], [49.8, 1948.0], [49.9, 1948.0], [50.0, 1950.0], [50.1, 1950.0], [50.2, 1950.0], [50.3, 1950.0], [50.4, 1950.0], [50.5, 1950.0], [50.6, 1950.0], [50.7, 1950.0], [50.8, 1950.0], [50.9, 1950.0], [51.0, 1957.0], [51.1, 1957.0], [51.2, 1957.0], [51.3, 1957.0], [51.4, 1957.0], [51.5, 1957.0], [51.6, 1957.0], [51.7, 1957.0], [51.8, 1957.0], [51.9, 1957.0], [52.0, 2003.0], [52.1, 2003.0], [52.2, 2003.0], [52.3, 2003.0], [52.4, 2003.0], [52.5, 2003.0], [52.6, 2003.0], [52.7, 2003.0], [52.8, 2003.0], [52.9, 2003.0], [53.0, 2003.0], [53.1, 2003.0], [53.2, 2003.0], [53.3, 2003.0], [53.4, 2003.0], [53.5, 2003.0], [53.6, 2003.0], [53.7, 2003.0], [53.8, 2003.0], [53.9, 2003.0], [54.0, 2005.0], [54.1, 2005.0], [54.2, 2005.0], [54.3, 2005.0], [54.4, 2005.0], [54.5, 2005.0], [54.6, 2005.0], [54.7, 2005.0], [54.8, 2005.0], [54.9, 2005.0], [55.0, 2015.0], [55.1, 2015.0], [55.2, 2015.0], [55.3, 2015.0], [55.4, 2015.0], [55.5, 2015.0], [55.6, 2015.0], [55.7, 2015.0], [55.8, 2015.0], [55.9, 2015.0], [56.0, 2041.0], [56.1, 2041.0], [56.2, 2041.0], [56.3, 2041.0], [56.4, 2041.0], [56.5, 2041.0], [56.6, 2041.0], [56.7, 2041.0], [56.8, 2041.0], [56.9, 2041.0], [57.0, 2089.0], [57.1, 2089.0], [57.2, 2089.0], [57.3, 2089.0], [57.4, 2089.0], [57.5, 2089.0], [57.6, 2089.0], [57.7, 2089.0], [57.8, 2089.0], [57.9, 2089.0], [58.0, 2104.0], [58.1, 2104.0], [58.2, 2104.0], [58.3, 2104.0], [58.4, 2104.0], [58.5, 2104.0], [58.6, 2104.0], [58.7, 2104.0], [58.8, 2104.0], [58.9, 2104.0], [59.0, 2121.0], [59.1, 2121.0], [59.2, 2121.0], [59.3, 2121.0], [59.4, 2121.0], [59.5, 2121.0], [59.6, 2121.0], [59.7, 2121.0], [59.8, 2121.0], [59.9, 2121.0], [60.0, 2136.0], [60.1, 2136.0], [60.2, 2136.0], [60.3, 2136.0], [60.4, 2136.0], [60.5, 2136.0], [60.6, 2136.0], [60.7, 2136.0], [60.8, 2136.0], [60.9, 2136.0], [61.0, 2141.0], [61.1, 2141.0], [61.2, 2141.0], [61.3, 2141.0], [61.4, 2141.0], [61.5, 2141.0], [61.6, 2141.0], [61.7, 2141.0], [61.8, 2141.0], [61.9, 2141.0], [62.0, 2151.0], [62.1, 2151.0], [62.2, 2151.0], [62.3, 2151.0], [62.4, 2151.0], [62.5, 2151.0], [62.6, 2151.0], [62.7, 2151.0], [62.8, 2151.0], [62.9, 2151.0], [63.0, 2158.0], [63.1, 2158.0], [63.2, 2158.0], [63.3, 2158.0], [63.4, 2158.0], [63.5, 2158.0], [63.6, 2158.0], [63.7, 2158.0], [63.8, 2158.0], [63.9, 2158.0], [64.0, 2179.0], [64.1, 2179.0], [64.2, 2179.0], [64.3, 2179.0], [64.4, 2179.0], [64.5, 2179.0], [64.6, 2179.0], [64.7, 2179.0], [64.8, 2179.0], [64.9, 2179.0], [65.0, 2191.0], [65.1, 2191.0], [65.2, 2191.0], [65.3, 2191.0], [65.4, 2191.0], [65.5, 2191.0], [65.6, 2191.0], [65.7, 2191.0], [65.8, 2191.0], [65.9, 2191.0], [66.0, 2262.0], [66.1, 2262.0], [66.2, 2262.0], [66.3, 2262.0], [66.4, 2262.0], [66.5, 2262.0], [66.6, 2262.0], [66.7, 2262.0], [66.8, 2262.0], [66.9, 2262.0], [67.0, 2272.0], [67.1, 2272.0], [67.2, 2272.0], [67.3, 2272.0], [67.4, 2272.0], [67.5, 2272.0], [67.6, 2272.0], [67.7, 2272.0], [67.8, 2272.0], [67.9, 2272.0], [68.0, 2285.0], [68.1, 2285.0], [68.2, 2285.0], [68.3, 2285.0], [68.4, 2285.0], [68.5, 2285.0], [68.6, 2285.0], [68.7, 2285.0], [68.8, 2285.0], [68.9, 2285.0], [69.0, 2307.0], [69.1, 2307.0], [69.2, 2307.0], [69.3, 2307.0], [69.4, 2307.0], [69.5, 2307.0], [69.6, 2307.0], [69.7, 2307.0], [69.8, 2307.0], [69.9, 2307.0], [70.0, 2315.0], [70.1, 2315.0], [70.2, 2315.0], [70.3, 2315.0], [70.4, 2315.0], [70.5, 2315.0], [70.6, 2315.0], [70.7, 2315.0], [70.8, 2315.0], [70.9, 2315.0], [71.0, 2330.0], [71.1, 2330.0], [71.2, 2330.0], [71.3, 2330.0], [71.4, 2330.0], [71.5, 2330.0], [71.6, 2330.0], [71.7, 2330.0], [71.8, 2330.0], [71.9, 2330.0], [72.0, 2331.0], [72.1, 2331.0], [72.2, 2331.0], [72.3, 2331.0], [72.4, 2331.0], [72.5, 2331.0], [72.6, 2331.0], [72.7, 2331.0], [72.8, 2331.0], [72.9, 2331.0], [73.0, 2345.0], [73.1, 2345.0], [73.2, 2345.0], [73.3, 2345.0], [73.4, 2345.0], [73.5, 2345.0], [73.6, 2345.0], [73.7, 2345.0], [73.8, 2345.0], [73.9, 2345.0], [74.0, 2361.0], [74.1, 2361.0], [74.2, 2361.0], [74.3, 2361.0], [74.4, 2361.0], [74.5, 2361.0], [74.6, 2361.0], [74.7, 2361.0], [74.8, 2361.0], [74.9, 2361.0], [75.0, 2421.0], [75.1, 2421.0], [75.2, 2421.0], [75.3, 2421.0], [75.4, 2421.0], [75.5, 2421.0], [75.6, 2421.0], [75.7, 2421.0], [75.8, 2421.0], [75.9, 2421.0], [76.0, 2456.0], [76.1, 2456.0], [76.2, 2456.0], [76.3, 2456.0], [76.4, 2456.0], [76.5, 2456.0], [76.6, 2456.0], [76.7, 2456.0], [76.8, 2456.0], [76.9, 2456.0], [77.0, 2470.0], [77.1, 2470.0], [77.2, 2470.0], [77.3, 2470.0], [77.4, 2470.0], [77.5, 2470.0], [77.6, 2470.0], [77.7, 2470.0], [77.8, 2470.0], [77.9, 2470.0], [78.0, 2474.0], [78.1, 2474.0], [78.2, 2474.0], [78.3, 2474.0], [78.4, 2474.0], [78.5, 2474.0], [78.6, 2474.0], [78.7, 2474.0], [78.8, 2474.0], [78.9, 2474.0], [79.0, 2508.0], [79.1, 2508.0], [79.2, 2508.0], [79.3, 2508.0], [79.4, 2508.0], [79.5, 2508.0], [79.6, 2508.0], [79.7, 2508.0], [79.8, 2508.0], [79.9, 2508.0], [80.0, 2513.0], [80.1, 2513.0], [80.2, 2513.0], [80.3, 2513.0], [80.4, 2513.0], [80.5, 2513.0], [80.6, 2513.0], [80.7, 2513.0], [80.8, 2513.0], [80.9, 2513.0], [81.0, 2526.0], [81.1, 2526.0], [81.2, 2526.0], [81.3, 2526.0], [81.4, 2526.0], [81.5, 2526.0], [81.6, 2526.0], [81.7, 2526.0], [81.8, 2526.0], [81.9, 2526.0], [82.0, 2537.0], [82.1, 2537.0], [82.2, 2537.0], [82.3, 2537.0], [82.4, 2537.0], [82.5, 2537.0], [82.6, 2537.0], [82.7, 2537.0], [82.8, 2537.0], [82.9, 2537.0], [83.0, 2564.0], [83.1, 2564.0], [83.2, 2564.0], [83.3, 2564.0], [83.4, 2564.0], [83.5, 2564.0], [83.6, 2564.0], [83.7, 2564.0], [83.8, 2564.0], [83.9, 2564.0], [84.0, 2601.0], [84.1, 2601.0], [84.2, 2601.0], [84.3, 2601.0], [84.4, 2601.0], [84.5, 2601.0], [84.6, 2601.0], [84.7, 2601.0], [84.8, 2601.0], [84.9, 2601.0], [85.0, 2604.0], [85.1, 2604.0], [85.2, 2604.0], [85.3, 2604.0], [85.4, 2604.0], [85.5, 2604.0], [85.6, 2604.0], [85.7, 2604.0], [85.8, 2604.0], [85.9, 2604.0], [86.0, 2605.0], [86.1, 2605.0], [86.2, 2605.0], [86.3, 2605.0], [86.4, 2605.0], [86.5, 2605.0], [86.6, 2605.0], [86.7, 2605.0], [86.8, 2605.0], [86.9, 2605.0], [87.0, 2610.0], [87.1, 2610.0], [87.2, 2610.0], [87.3, 2610.0], [87.4, 2610.0], [87.5, 2610.0], [87.6, 2610.0], [87.7, 2610.0], [87.8, 2610.0], [87.9, 2610.0], [88.0, 2622.0], [88.1, 2622.0], [88.2, 2622.0], [88.3, 2622.0], [88.4, 2622.0], [88.5, 2622.0], [88.6, 2622.0], [88.7, 2622.0], [88.8, 2622.0], [88.9, 2622.0], [89.0, 2634.0], [89.1, 2634.0], [89.2, 2634.0], [89.3, 2634.0], [89.4, 2634.0], [89.5, 2634.0], [89.6, 2634.0], [89.7, 2634.0], [89.8, 2634.0], [89.9, 2634.0], [90.0, 2637.0], [90.1, 2637.0], [90.2, 2637.0], [90.3, 2637.0], [90.4, 2637.0], [90.5, 2637.0], [90.6, 2637.0], [90.7, 2637.0], [90.8, 2637.0], [90.9, 2637.0], [91.0, 2637.0], [91.1, 2637.0], [91.2, 2637.0], [91.3, 2637.0], [91.4, 2637.0], [91.5, 2637.0], [91.6, 2637.0], [91.7, 2637.0], [91.8, 2637.0], [91.9, 2637.0], [92.0, 2654.0], [92.1, 2654.0], [92.2, 2654.0], [92.3, 2654.0], [92.4, 2654.0], [92.5, 2654.0], [92.6, 2654.0], [92.7, 2654.0], [92.8, 2654.0], [92.9, 2654.0], [93.0, 2663.0], [93.1, 2663.0], [93.2, 2663.0], [93.3, 2663.0], [93.4, 2663.0], [93.5, 2663.0], [93.6, 2663.0], [93.7, 2663.0], [93.8, 2663.0], [93.9, 2663.0], [94.0, 2663.0], [94.1, 2663.0], [94.2, 2663.0], [94.3, 2663.0], [94.4, 2663.0], [94.5, 2663.0], [94.6, 2663.0], [94.7, 2663.0], [94.8, 2663.0], [94.9, 2663.0], [95.0, 2667.0], [95.1, 2667.0], [95.2, 2667.0], [95.3, 2667.0], [95.4, 2667.0], [95.5, 2667.0], [95.6, 2667.0], [95.7, 2667.0], [95.8, 2667.0], [95.9, 2667.0], [96.0, 2681.0], [96.1, 2681.0], [96.2, 2681.0], [96.3, 2681.0], [96.4, 2681.0], [96.5, 2681.0], [96.6, 2681.0], [96.7, 2681.0], [96.8, 2681.0], [96.9, 2681.0], [97.0, 2682.0], [97.1, 2682.0], [97.2, 2682.0], [97.3, 2682.0], [97.4, 2682.0], [97.5, 2682.0], [97.6, 2682.0], [97.7, 2682.0], [97.8, 2682.0], [97.9, 2682.0], [98.0, 2686.0], [98.1, 2686.0], [98.2, 2686.0], [98.3, 2686.0], [98.4, 2686.0], [98.5, 2686.0], [98.6, 2686.0], [98.7, 2686.0], [98.8, 2686.0], [98.9, 2686.0], [99.0, 2688.0], [99.1, 2688.0], [99.2, 2688.0], [99.3, 2688.0], [99.4, 2688.0], [99.5, 2688.0], [99.6, 2688.0], [99.7, 2688.0], [99.8, 2688.0], [99.9, 2688.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 2.0, "minX": 800.0, "maxY": 16.0, "series": [{"data": [[2100.0, 8.0], [2200.0, 3.0], [2300.0, 6.0], [2400.0, 4.0], [2500.0, 5.0], [2600.0, 16.0], [800.0, 2.0], [900.0, 3.0], [1100.0, 4.0], [1200.0, 8.0], [1300.0, 2.0], [1400.0, 7.0], [1500.0, 5.0], [1600.0, 6.0], [1700.0, 3.0], [1800.0, 8.0], [1900.0, 4.0], [2000.0, 6.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2600.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 26.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 74.0, "series": [{"data": [[1.0, 26.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 74.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 100.0, "minX": 1.62896784E12, "maxY": 100.0, "series": [{"data": [[1.62896784E12, 100.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.62896784E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 1927.37, "minX": 100.0, "maxY": 1927.37, "series": [{"data": [[100.0, 1927.37]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[100.0, 1927.37]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 203.33333333333334, "minX": 1.62896784E12, "maxY": 3248.8333333333335, "series": [{"data": [[1.62896784E12, 3248.8333333333335]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.62896784E12, 203.33333333333334]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.62896784E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1927.37, "minX": 1.62896784E12, "maxY": 1927.37, "series": [{"data": [[1.62896784E12, 1927.37]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.62896784E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 1923.76, "minX": 1.62896784E12, "maxY": 1923.76, "series": [{"data": [[1.62896784E12, 1923.76]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.62896784E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 1735.2299999999993, "minX": 1.62896784E12, "maxY": 1735.2299999999993, "series": [{"data": [[1.62896784E12, 1735.2299999999993]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.62896784E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 878.0, "minX": 1.62896784E12, "maxY": 2688.0, "series": [{"data": [[1.62896784E12, 2688.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.62896784E12, 878.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.62896784E12, 2636.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.62896784E12, 2687.98]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.62896784E12, 2666.8]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.62896784E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 1949.0, "minX": 1.0, "maxY": 1949.0, "series": [{"data": [[1.0, 1949.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 1948.5, "minX": 1.0, "maxY": 1948.5, "series": [{"data": [[1.0, 1948.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.62896784E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.62896784E12, 1.6666666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.62896784E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.62896784E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.62896784E12, 1.6666666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.62896784E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.62896784E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.62896784E12, 1.6666666666666667]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.62896784E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
